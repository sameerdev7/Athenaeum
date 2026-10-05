"""Pure-ASGI middleware: security headers, request id, access log.

Written as raw ASGI (not BaseHTTPMiddleware) so WebSocket traffic passes
through untouched and streaming responses aren't buffered.
"""

import logging
import time
import uuid

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from config import settings

logger = logging.getLogger("athenaeum.access")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # microphone is needed for audio rooms; everything else stays off.
    "Permissions-Policy": "camera=(), geolocation=(), microphone=(self)",
}
if settings.env.lower() == "production":
    SECURITY_HEADERS["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"


class SecurityAndLoggingMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = uuid.uuid4().hex[:12]
        started = time.perf_counter()
        status_code = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS.items():
                    headers.setdefault(name, value)
                headers["X-Request-ID"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            path = scope.get("path", "")
            if path != "/health":
                logger.info(
                    "%s %s %s %.0fms rid=%s",
                    scope.get("method"),
                    path,
                    status_code,
                    (time.perf_counter() - started) * 1000,
                    request_id,
                )
