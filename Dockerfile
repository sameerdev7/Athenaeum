# uv's own base image: ships the uv binary on top of a slim Python matching
# pyproject.toml's requires-python, so `uv sync` needs nothing extra installed.
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app

# Dependencies first, in their own layer, so editing application code doesn't
# invalidate the (slow) dependency-install layer on the next build.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY . .
RUN uv sync --frozen --no-dev

# Run as an unprivileged user: a compromised process shouldn't own the container.
# uploads/ is where avatar uploads land; mount a volume there in production.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/uploads \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Orchestrators (and `docker ps`) can see whether the API is actually serving.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1

# Migrations are a deploy step, not something this container does on boot
# (see database.py / main.py's lifespan) — run `uv run alembic upgrade head`
# as the platform's pre-deploy/release command, separately from this CMD.
# One worker on purpose: the chat hub (chat.py) and the rate limiter keep state in
# memory. Scaling out needs Redis behind both first (see docs/ARCHITECTURE.md).
CMD ["uv", "run", "--no-sync", "fastapi", "run", "main.py", "--port", "8000"]
