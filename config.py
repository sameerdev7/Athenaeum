from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    # "development" (default) or "production". Production refuses to boot with a
    # weak secret or a wildcard/localhost-only CORS list (see validate_for_production).
    env: str = "development"
    log_level: str = "INFO"
    # Comma-separated Host headers to accept; "*" = any. Set to your API domain in production.
    allowed_hosts: str = "*"
    rate_limit_enabled: bool = True

    secret_key: SecretStr
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # sqlite locally by default; set DATABASE_URL in production to a
    # postgresql+asyncpg:// URL (e.g. Neon) — same code path either way,
    # SQLAlchemy picks the driver from the URL's scheme.
    database_url: str = "sqlite+aiosqlite:///./athenaeum.db"

    # Where uploaded files live. On hosts with an ephemeral disk, point this at
    # a mounted volume or the uploads vanish on redeploy.
    upload_dir: str = "uploads"

    # frontend origin(s) allowed to call this API, comma-separated. The
    # local Vite dev server by default; set to the deployed frontend's real
    # origin in production, never "*" once cookies/auth headers are in play.
    cors_origins: str = "http://localhost:5173"

    # Password-reset email. Unset SMTP_HOST = log the message instead of sending
    # (dev/tests). frontend_url is where the emailed link points.
    frontend_url: str = "http://localhost:5173"
    password_reset_expire_minutes: int = 30
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from: str = "Athenaeum <no-reply@athenaeum.local>"
    smtp_starttls: bool = True

    # audio rooms — unset until a LiveKit Cloud project exists, endpoints 503 until then
    livekit_api_key: str | None = None
    livekit_api_secret: SecretStr | None = None
    livekit_url: str | None = None


settings = Settings()


def validate_for_production(s: Settings = settings) -> None:
    """Fail fast on unsafe production config instead of serving with it."""
    if s.env.lower() != "production":
        return
    problems = []
    if len(s.secret_key.get_secret_value()) < 32:
        problems.append("SECRET_KEY must be at least 32 characters (try: openssl rand -hex 32)")
    origins = [o.strip() for o in s.cors_origins.split(",") if o.strip()]
    if not origins or "*" in origins:
        problems.append("CORS_ORIGINS must list your real frontend origin(s), not '*'")
    elif all("localhost" in o or "127.0.0.1" in o for o in origins):
        problems.append("CORS_ORIGINS only allows localhost; set your deployed frontend origin")
    if s.allowed_hosts.strip() in ("", "*"):
        problems.append("ALLOWED_HOSTS should be your API domain(s) in production")
    if problems:
        raise RuntimeError("Unsafe production configuration:\n  - " + "\n  - ".join(problems))

