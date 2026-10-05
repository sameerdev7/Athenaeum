"""WebSocket group chat, tested over a real socket.

Starlette's TestClient can't share the async in-memory test database (it runs
the app on another event loop), so these tests start a genuine uvicorn server
in a background thread on a temporary SQLite *file* and talk to it with the
`websockets` client and plain HTTP. That exercises the real handshake, close
codes, broadcast and cleanup paths exactly as a browser would.
"""

import asyncio
import json
import socket
import threading
import time
from contextlib import contextmanager
from datetime import datetime

import httpx
import pytest
import uvicorn
from sqlalchemy import event
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from websockets.exceptions import ConnectionClosed, InvalidStatus
from websockets.sync.client import connect

import routers.groups as groups_router
from chat import manager
from database import Base, get_db
from main import app


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def server(tmp_path):
    """A live app on a temp-file database. Yields the base URL."""
    url = f"sqlite+aiosqlite:///{tmp_path / 'chat.db'}"
    engine = create_async_engine(url, poolclass=NullPool)

    @event.listens_for(engine.sync_engine, "connect")
    def _fk(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async def create_schema():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(create_schema())
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with sessions() as db:
            yield db

    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    manager.active_connections.clear()

    port = _free_port()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", ws="websockets-sansio")
    srv = uvicorn.Server(config)
    thread = threading.Thread(target=srv.run, daemon=True)
    thread.start()
    deadline = time.time() + 10
    while not srv.started and time.time() < deadline:
        time.sleep(0.05)
    assert srv.started, "test server failed to start"

    yield f"http://127.0.0.1:{port}"

    srv.should_exit = True
    thread.join(timeout=10)
    if previous is not None:
        app.dependency_overrides[get_db] = previous
    else:
        app.dependency_overrides.pop(get_db, None)
    manager.active_connections.clear()


class Api:
    """Tiny sync helper around the live server."""

    def __init__(self, base: str):
        self.base = base
        self.http = httpx.Client(base_url=base, timeout=10)

    def user(self, name: str) -> dict:
        self.http.post("/api/users", json={"username": name, "email": f"{name}@example.com", "password": "password123"})
        token = self.http.post("/api/users/token", data={"username": f"{name}@example.com", "password": "password123"}).json()["access_token"]
        me = self.http.get("/api/users/me", headers={"Authorization": f"Bearer {token}"}).json()
        return {"id": me["id"], "token": token, "headers": {"Authorization": f"Bearer {token}"}}

    def group(self, owner: dict, name="Room") -> int:
        return self.http.post("/api/groups", json={"name": name}, headers=owner["headers"]).json()["id"]

    def join(self, user: dict, gid: int) -> None:
        assert self.http.post(f"/api/groups/{gid}/members", headers=user["headers"]).status_code == 201

    def ws_url(self, gid: int, token: str) -> str:
        return f"ws://{self.base.removeprefix('http://')}/api/groups/{gid}/ws?token={token}"


@pytest.fixture
def api(server):
    return Api(server)


@contextmanager
def chat(api: Api, gid: int, user: dict):
    with connect(api.ws_url(gid, user["token"]), open_timeout=5) as ws:
        yield ws


def recv_json(ws, timeout=3):
    return json.loads(ws.recv(timeout=timeout))


def wait_for(predicate, timeout=3.0):
    end = time.time() + timeout
    while time.time() < end:
        if predicate():
            return True
        time.sleep(0.05)
    return predicate()


# --- handshake ---------------------------------------------------------------

def test_missing_bad_and_nonmember_are_rejected(api):
    alice, bob = api.user("alice"), api.user("bob")
    gid = api.group(alice)

    with pytest.raises(InvalidStatus) as missing:  # no token at all (422 from validation)
        connect(f"ws://{api.base.removeprefix('http://')}/api/groups/{gid}/ws", open_timeout=5)
    assert missing.value.response.status_code in (403, 422)

    with pytest.raises(InvalidStatus) as garbage:  # not a JWT -> closed before accept
        connect(api.ws_url(gid, "not-a-jwt"), open_timeout=5)
    assert garbage.value.response.status_code == 403

    with pytest.raises(InvalidStatus) as outsider:  # valid token, but not in the group
        connect(api.ws_url(gid, bob["token"]), open_timeout=5)
    assert outsider.value.response.status_code == 403
    assert manager.count(gid) == 0


# --- messaging ---------------------------------------------------------------

def test_two_members_exchange_messages(api):
    alice, bob = api.user("alice"), api.user("bob")
    gid = api.group(alice)
    api.join(bob, gid)

    with chat(api, gid, alice) as a, chat(api, gid, bob) as b:
        assert wait_for(lambda: manager.count(gid) == 2)
        a.send("hello from alice")
        got_a, got_b = recv_json(a), recv_json(b)  # sender gets the broadcast too
        for msg in (got_a, got_b):
            assert msg["body"] == "hello from alice"
            assert msg["username"] == "alice" and msg["user_id"] == alice["id"]
            assert msg["group_id"] == gid and isinstance(msg["id"], int)
            assert "avatar_url" in msg
            assert datetime.fromisoformat(msg["created_at"]).tzinfo is not None  # UTC offset present

        b.send("hi alice")
        assert recv_json(a)["username"] == "bob"
        assert recv_json(b)["body"] == "hi alice"

    # persisted, and readable through the (members-only) history endpoint
    history = api.http.get(f"/api/groups/{gid}/messages", headers=alice["headers"]).json()
    assert [m["body"] for m in history] == ["hi alice", "hello from alice"]


def test_messages_stay_inside_their_group(api):
    alice, bob = api.user("alice"), api.user("bob")
    one, two = api.group(alice, "One"), api.group(bob, "Two")

    with chat(api, one, alice) as a, chat(api, two, bob) as b:
        a.send("only for group one")
        assert recv_json(a)["body"] == "only for group one"
        with pytest.raises(TimeoutError):
            b.recv(timeout=0.5)


def test_bad_frames_are_rejected_without_closing_the_socket(api):
    alice = api.user("alice")
    gid = api.group(alice)

    with chat(api, gid, alice) as ws:
        ws.send("   ")
        assert recv_json(ws)["type"] == "error"
        ws.send("x" * (groups_router.MAX_MESSAGE_LENGTH + 1))
        assert recv_json(ws)["type"] == "error"
        ws.send(b"\x00\x01 binary")
        assert recv_json(ws)["type"] == "error"

        ws.send("still alive")  # the connection survived all three
        assert recv_json(ws)["body"] == "still alive"

    history = api.http.get(f"/api/groups/{gid}/messages", headers=alice["headers"]).json()
    assert [m["body"] for m in history] == ["still alive"]  # rejects were never stored


def test_dead_peer_does_not_break_the_sender(api):
    alice, bob = api.user("alice"), api.user("bob")
    gid = api.group(alice)
    api.join(bob, gid)

    with chat(api, gid, alice) as a:
        b = connect(api.ws_url(gid, bob["token"]), open_timeout=5)
        assert wait_for(lambda: manager.count(gid) == 2)
        b.socket.close()  # vanish without a closing handshake

        a.send("anyone there?")
        assert recv_json(a)["body"] == "anyone there?"  # alice is unaffected
        a.send("second one")
        assert recv_json(a)["body"] == "second one"
        assert wait_for(lambda: manager.count(gid) == 1)  # the dead peer was pruned


def test_disconnect_cleans_up(api):
    alice = api.user("alice")
    gid = api.group(alice)
    with chat(api, gid, alice):
        assert wait_for(lambda: manager.count(gid) == 1)
    assert wait_for(lambda: manager.count(gid) == 0)


# --- membership changes & limits --------------------------------------------

def test_leaving_the_group_closes_your_socket(api):
    alice, bob = api.user("alice"), api.user("bob")
    gid = api.group(alice)
    api.join(bob, gid)

    with chat(api, gid, bob) as b:
        assert wait_for(lambda: manager.count(gid) == 1)
        assert api.http.delete(f"/api/groups/{gid}/members/me", headers=bob["headers"]).status_code == 200
        with pytest.raises(ConnectionClosed) as closed:
            b.recv(timeout=3)
        assert closed.value.rcvd.code == 4403
    assert wait_for(lambda: manager.count(gid) == 0)


def test_deleting_the_group_closes_everyone(api):
    alice = api.user("alice")
    gid = api.group(alice)
    with chat(api, gid, alice) as a:
        assert wait_for(lambda: manager.count(gid) == 1)
        assert api.http.delete(f"/api/groups/{gid}", headers=alice["headers"]).status_code == 200
        with pytest.raises(ConnectionClosed) as closed:
            a.recv(timeout=3)
        assert closed.value.rcvd.code == 4404


def test_rate_limit_closes_a_flooding_socket(api, monkeypatch):
    monkeypatch.setattr(groups_router, "RATE_LIMIT_MESSAGES", 3)
    alice = api.user("alice")
    gid = api.group(alice)

    with chat(api, gid, alice) as ws:
        for n in range(3):
            ws.send(f"m{n}")
            assert recv_json(ws)["body"] == f"m{n}"
        ws.send("one too many")
        with pytest.raises(ConnectionClosed) as closed:
            ws.recv(timeout=3)
        assert closed.value.rcvd.code == 4408
