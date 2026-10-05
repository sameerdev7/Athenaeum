"""Production hardening: pagination caps, rate limits, headers, fail-fast config."""

import pytest

from config import Settings, validate_for_production
from limiter import limiter


# --- pagination ---------------------------------------------------------------

@pytest.mark.parametrize(
    "path",
    ["/api/logs", "/api/lists", "/api/groups", "/api/journal", "/api/books/1/similar"],
)
async def test_limit_is_bounded(client, path):
    assert (await client.get(f"{path}?limit=0")).status_code == 422
    assert (await client.get(f"{path}?limit=-5")).status_code == 422
    assert (await client.get(f"{path}?limit=100000")).status_code == 422


@pytest.mark.parametrize("path", ["/api/logs", "/api/lists", "/api/groups", "/api/journal"])
async def test_offset_cannot_be_negative(client, path):
    assert (await client.get(f"{path}?offset=-1")).status_code == 422


async def test_followers_limit_is_bounded(client, alice):
    uid = (await client.get("/api/users/me", headers=alice)).json()["id"]
    assert (await client.get(f"/api/users/{uid}/followers?limit=1000")).status_code == 422
    assert (await client.get(f"/api/users/{uid}/following?limit=0")).status_code == 422


# --- rate limiting -----------------------------------------------------------

@pytest.fixture
def rate_limited():
    limiter.reset()
    limiter.enabled = True
    yield
    limiter.enabled = False
    limiter.reset()


async def test_login_is_rate_limited(client, rate_limited):
    body = {"username": "nobody@example.com", "password": "wrong-password"}
    codes = [(await client.post("/api/users/token", data=body)).status_code for _ in range(12)]
    assert codes[0] == 401  # real answer first
    assert 429 in codes  # then throttled
    assert codes.index(429) <= 10


async def test_forgot_password_is_rate_limited(client, rate_limited):
    codes = [
        (await client.post("/api/users/forgot-password", json={"email": "a@example.com"})).status_code
        for _ in range(7)
    ]
    assert codes[:5] == [202] * 5
    assert codes[5] == 429


async def test_register_is_rate_limited(client, rate_limited):
    codes = []
    for n in range(12):
        r = await client.post(
            "/api/users", json={"username": f"user{n}", "email": f"user{n}@example.com", "password": "password123"}
        )
        codes.append(r.status_code)
    assert codes[:10] == [201] * 10
    assert 429 in codes[10:]


# --- headers -----------------------------------------------------------------

async def test_security_headers_and_request_id(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"
    assert "microphone=(self)" in resp.headers["permissions-policy"]
    assert len(resp.headers["x-request-id"]) == 12


async def test_request_ids_are_unique(client):
    a = (await client.get("/health")).headers["x-request-id"]
    b = (await client.get("/health")).headers["x-request-id"]
    assert a != b


async def test_removed_dev_routes_stay_removed(client):
    assert (await client.get("/")).status_code == 404
    assert (await client.get("/posts")).status_code == 404


async def test_moved_routes_still_work(client, alice):
    from tests.conftest import create_book

    book = await create_book(client, alice)
    assert (await client.get("/api/books")).json()[0]["id"] == book["id"]
    uid = (await client.get("/api/users/me", headers=alice)).json()["id"]
    assert [b["id"] for b in (await client.get(f"/api/users/{uid}/books")).json()] == [book["id"]]
    assert (await client.get("/api/users/999/books")).status_code == 404


# --- fail-fast production config ---------------------------------------------

def _settings(**over):
    base = dict(secret_key="s" * 40, env="production", cors_origins="https://app.example.com", allowed_hosts="api.example.com")
    return Settings(_env_file=None, **{**base, **over})


def test_development_is_never_blocked():
    validate_for_production(Settings(_env_file=None, secret_key="short", env="development"))


def test_good_production_config_passes():
    validate_for_production(_settings())


@pytest.mark.parametrize(
    "override, needle",
    [
        ({"secret_key": "tooshort"}, "SECRET_KEY"),
        ({"cors_origins": "*"}, "CORS_ORIGINS"),
        ({"cors_origins": "http://localhost:5173"}, "localhost"),
        ({"allowed_hosts": "*"}, "ALLOWED_HOSTS"),
    ],
)
def test_unsafe_production_config_refuses_to_boot(override, needle):
    with pytest.raises(RuntimeError) as err:
        validate_for_production(_settings(**override))
    assert needle in str(err.value)
