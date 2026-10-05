# Athenaeum

A social reading platform: users log books, rate and review them, follow each
other, build lists, write long-form journal entries, and join groups with live
chat and audio rooms.

This README is a technical reference. Longer design notes live in `docs/`
(local only, not tracked by git): `ARCHITECTURE.md`, `AUTH.md`,
`PRODUCTION.md`, `TESTING.md`.

## Stack

| Layer | Technology |
| --- | --- |
| API | Python 3.13, FastAPI, Pydantic v2, pydantic-settings |
| Database | SQLAlchemy 2 (async), SQLite in development, PostgreSQL (asyncpg) in production, Alembic migrations |
| Auth | JWT (HS256) bearer tokens, Argon2 password hashing (pwdlib), email reset links |
| Real time | WebSockets (group chat), LiveKit (WebRTC audio rooms) |
| ML | scikit-learn, TF-IDF with cosine similarity ("similar books") |
| Frontend | React 19, React Router 7, Tailwind CSS 4, Vite 8, livekit-client, react-markdown |
| Tooling | uv, pytest + pytest-asyncio, oxlint, Playwright (e2e script), Docker, GitHub Actions |

## Repository layout

```
.
├── main.py                 app setup: logging, middleware, routers, /health
├── config.py               settings from environment / .env, production config check
├── database.py             async engine, SessionLocal, Base, get_db
├── models.py               SQLAlchemy models (14 tables)
├── schemas.py              Pydantic request/response models
├── auth.py                 hashing, JWT, get_current_user, optional auth
├── permissions.py          check_ownership helper
├── limiter.py              slowapi rate limiter and limits
├── middleware.py           security headers, request id, access log (ASGI)
├── emailer.py              SMTP sender, reset email template
├── chat.py                 in-memory WebSocket connection manager
├── recommendations.py      TF-IDF similar books
├── routers/                users, follows, books, reading_logs, comments,
│                           lists, journal, groups, posts
├── alembic/                migrations (13)
├── tests/                  pytest suite (94 tests)
├── seed_*.py               catalogue and demo data scripts
├── Dockerfile
├── .github/workflows/      CI
└── marginalia-web/         React client (src/, e2e/)
```

## Data model

Tables: `users`, `books`, `follows`, `reading_logs`, `comments`, `likes`,
`lists`, `list_items`, `journal_entries`, `groups`, `group_members`, `posts`,
`messages`, `audio_sessions`, `password_reset_tokens`.

Notes:

- A reading log is the review. Ratings belong to logs, not books.
- Comments key off `log_id` and support one level of replies (`parent_id`).
- Unique constraints: `(follower_id, followed_id)`, `(user_id, log_id)`,
  `(list_id, book_id)`, `(group_id, user_id)`, `username`, `email`.
- Group child tables cascade on group delete. At most one live audio session
  per group is enforced by a partial unique index.
- Password reset tokens are stored as SHA-256 hashes.
- Datetimes are stored as UTC. Response schemas re-attach the UTC offset
  (`UTCDatetime`) because SQLite returns naive values.

See `docs/ARCHITECTURE.md` for the full ER diagram.

## API overview

All routes are under `/api`. Interactive docs are served at `/docs`.

| Prefix | Purpose |
| --- | --- |
| `/users` | register, login (`POST /users/token`, form body, email in `username`), `me`, avatar upload, forgot/reset password, follow graph |
| `/books` | catalogue, similar books, Open Library search proxy |
| `/logs` | reading logs, feed, popular among friends, comments, likes |
| `/lists` | lists and list items |
| `/journal` | markdown journal entries, drafts, `mine` |
| `/groups` | groups, members, posts, chat history, chat WebSocket, audio sessions |
| `/posts`, `/comments` | edit and delete single posts and comments |
| `/uploads` | static avatar files |

Conventions: reads are public, writes need a bearer token, editing a row needs
ownership. List endpoints accept `limit` (1 to 100) and `offset`.

### Chat WebSocket

`ws://<host>/api/groups/{id}/ws?token=<jwt>`

- Client sends one text frame per message (trimmed, 1 to 2000 characters).
- Server broadcasts `{id, group_id, user_id, username, avatar_url, body, created_at}`
  to everyone in the group and sends `{"type": "error", "detail": "..."}` to
  the sender for rejected frames.
- Handshake is rejected for a bad token or a non-member. After accept, the
  server closes with 4403 (no longer a member), 4404 (group deleted) or 4408
  (more than 20 messages per 10 seconds).
- The connection manager is in memory, so run a single worker unless a
  pub/sub layer is added.

### Audio rooms

`POST /groups/{id}/audio-sessions` creates the bookkeeping row,
`.../{sid}/join` returns a LiveKit token (2 hour TTL, publish and subscribe),
`.../{sid}/end` ends the session and deletes the LiveKit room. The session
starter or the group owner can end it. Media goes directly between the browser
and LiveKit.

## Running locally

Requirements: Python 3.13 with [uv](https://docs.astral.sh/uv/), Node 22.

```bash
uv sync
echo "SECRET_KEY=$(openssl rand -hex 32)" > .env
uv run alembic upgrade head
uv run fastapi dev main.py
```

Frontend (separate terminal):

```bash
cd marginalia-web
npm install
npm run dev
```

The Vite dev server proxies `/api` (including WebSockets) to
`http://127.0.0.1:8000`. To use another backend port:

```bash
API_PROXY=http://127.0.0.1:8010 npm run dev
```

### Seed data

Run in this order (all idempotent):

```bash
uv run python seed_books.py       # about 195 books via Open Library
uv run python seed_activity.py    # readers, logs, comments, likes, lists, groups
uv run python seed_lists.py       # themed lists
uv run python seed_journal.py     # example journal entries
uv run python seed_community.py   # portrait avatars, more readers, 70 API checks
```

Seeded readers share the password `vellum-2024`. Their email is the username
with `_` replaced by `.`, for example `mara.linden@athenaeum.app`.

## Configuration

Environment variables (or `.env`), see `config.py`:

| Variable | Default | Notes |
| --- | --- | --- |
| `SECRET_KEY` | required | JWT signing key, 32+ characters in production |
| `ENV` | `development` | `production` enables startup checks and HSTS |
| `DATABASE_URL` | `sqlite+aiosqlite:///./athenaeum.db` | use `postgresql+asyncpg://...` in production |
| `CORS_ORIGINS` | `http://localhost:5173` | comma separated |
| `ALLOWED_HOSTS` | `*` | set to the API domain in production |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | |
| `UPLOAD_DIR` | `uploads` | avatar uploads, needs a persistent volume in production |
| `FRONTEND_URL` | `http://localhost:5173` | base of the emailed reset link |
| `PASSWORD_RESET_EXPIRE_MINUTES` | `30` | |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_STARTTLS` | unset, `587`, ... | with no host set, reset emails are logged instead of sent |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` | unset | audio rooms return 503 until set |
| `RATE_LIMIT_ENABLED` | `true` | disable for tests and bulk seeding |
| `LOG_LEVEL` | `INFO` | |

Frontend: `VITE_API_URL` (bare API origin for production builds, which also
makes the WebSocket use `wss://`) and `API_PROXY` (dev proxy target).

With `ENV=production` the app refuses to start if the secret is under 32
characters, `CORS_ORIGINS` is `*` or localhost only, or `ALLOWED_HOSTS` is `*`.

## Testing

```bash
uv run pytest -q
```

94 tests. Files: `test_auth`, `test_books`, `test_social`, `test_journal`,
`test_avatar_upload`, `test_groups`, `test_audio`, `test_chat`,
`test_hardening`.

- Tests use an in-memory SQLite database with foreign keys enabled, recreated
  per test. The rate limiter is off by default.
- `test_chat.py` starts a real uvicorn server in a thread on a temporary
  SQLite file and connects with the `websockets` client.
- LiveKit calls are mocked or exercised locally (no network).

Frontend checks:

```bash
cd marginalia-web
npx oxlint
npm run build
```

### End-to-end audio and chat check

`marginalia-web/e2e/audio-room.mjs` drives real Chromium pages (fake
microphone) against a local LiveKit server and runs 40 checks covering remote
audio playback, mute, listener mode, session end, chat reconnect and backfill.

```bash
docker run -d --rm --name lk-dev --network host livekit/livekit-server --dev --bind 127.0.0.1 --node-ip 127.0.0.1
LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret LIVEKIT_URL=ws://127.0.0.1:7880 RATE_LIMIT_ENABLED=false uv run uvicorn main:app --port 8010
cd marginalia-web && API_PROXY=http://127.0.0.1:8010 npx vite --port 5180
node e2e/audio-room.mjs
```

Run the backend against a copy of the database, since the script creates its
own group and users. When experimenting with `alembic downgrade`, always set
`DATABASE_URL` to a scratch database first.

## Migrations

```bash
uv run alembic revision --autogenerate -m "message"   # then read the file
uv run alembic upgrade head
```

The schema is managed only by Alembic (no `create_all` at startup). In
production, run the upgrade as a separate deploy step.

## Docker

```bash
docker build -t athenaeum .
docker run -p 8000:8000 -e SECRET_KEY=... -e DATABASE_URL=... athenaeum
```

The image runs as a non-root user with a `/health` healthcheck and a single
worker. Run `alembic upgrade head` separately before starting it.

## CI

`.github/workflows/ci.yml` applies migrations to an empty database and runs
pytest. `.github/workflows/frontend-ci.yml` runs oxlint and the production
build in `marginalia-web`.

## Known limitations

- JWTs are stateless and not revocable; they expire after 30 minutes.
- The JWT is passed in the WebSocket query string, so it can appear in proxy logs.
- The chat hub and rate limiter are in memory, so a single worker only.
- Avatar uploads are stored on local disk.
- Deleting a book or user does not cascade to its dependent rows.
- Email is sent through plain SMTP in a background task, with no retry queue.
