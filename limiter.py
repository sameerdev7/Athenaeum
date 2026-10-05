"""Shared rate limiter (slowapi). In-memory per process: fine for one worker;
use a Redis storage URI here when running several.

Limits are deliberately generous for humans and tight for scripts. Disable in
tests / bulk seeding with RATE_LIMIT_ENABLED=false.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from config import settings

limiter = Limiter(key_func=get_remote_address, enabled=settings.rate_limit_enabled)

LOGIN_LIMIT = "10/minute"
REGISTER_LIMIT = "10/hour"
FORGOT_PASSWORD_LIMIT = "5/hour"
RESET_PASSWORD_LIMIT = "10/hour"
