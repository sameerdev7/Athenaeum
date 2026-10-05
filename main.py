import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import settings, validate_for_production
from database import engine
from limiter import limiter
from middleware import SecurityAndLoggingMiddleware

from routers import users, books, follows, reading_logs, comments, lists, groups, posts, journal

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
validate_for_production()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Startup — schema is managed by alembic now, run `alembic upgrade head` before starting
    yield
    # shutdown
    await engine.dispose()

app = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# The frontend is a separate origin in every deployed setup (and in local
# dev, :5173 vs :8000) — without this, the browser blocks every request
# before it reaches a route. Origins come from settings.cors_origins so
# production points at the real deployed frontend without a code change.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
if settings.allowed_hosts.strip() not in ("", "*"):
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=[h.strip() for h in settings.allowed_hosts.split(",")],
    )
# Added last = outermost: headers + request id + access log wrap everything.
app.add_middleware(SecurityAndLoggingMiddleware)

# Uploaded avatars. Under /api so the dev proxy and any /api-routing reverse
# proxy serve them with no extra config.
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(books.router, prefix="/api/books", tags=["books"])
app.include_router(follows.router, prefix="/api/users", tags=["follows"])
app.include_router(reading_logs.router, prefix="/api/logs", tags=["logs"])
app.include_router(comments.router, prefix="/api/comments", tags=["comments"])
app.include_router(lists.router, prefix="/api/lists", tags=["lists"])
app.include_router(groups.router, prefix="/api/groups", tags=["groups"])
app.include_router(posts.router, prefix="/api/posts", tags=["posts"])
app.include_router(journal.router, prefix="/api/journal", tags=["journal"])


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}
