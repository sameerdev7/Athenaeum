"""Audio rooms: bookkeeping rules, LiveKit token contents, and room teardown.

No network: token minting is local, and the LiveKit server call made when a
session ends is replaced with a recorder.
"""

import jwt
import pytest
from pydantic import SecretStr

import routers.groups as groups_router
from config import settings
from tests.test_groups import join, make_group

SECRET = "x" * 40  # LiveKit secrets are long; HS256 wants >= 32 bytes


@pytest.fixture
def livekit(monkeypatch):
    monkeypatch.setattr(settings, "livekit_api_key", "devkey")
    monkeypatch.setattr(settings, "livekit_api_secret", SecretStr(SECRET))
    monkeypatch.setattr(settings, "livekit_url", "wss://example.livekit.test")


@pytest.fixture
def deleted_rooms(monkeypatch):
    """Record rooms the server asked LiveKit to delete instead of calling it."""
    calls: list[str] = []

    async def fake_delete(room_name: str) -> None:
        calls.append(room_name)

    monkeypatch.setattr(groups_router, "_delete_livekit_room", fake_delete)
    return calls


async def start(client, headers, gid):
    return await client.post(f"/api/groups/{gid}/audio-sessions", headers=headers)


# --- start ------------------------------------------------------------------

async def test_start_rules(client, alice, bob):
    group = await make_group(client, alice)
    gid = group["id"]

    assert (await client.post(f"/api/groups/{gid}/audio-sessions")).status_code == 401
    assert (await start(client, alice, 999)).status_code == 404
    assert (await start(client, bob, gid)).status_code == 403  # not a member

    first = await start(client, alice, gid)
    assert first.status_code == 201
    body = first.json()
    assert body["ended_at"] is None
    assert body["room_name"].startswith(f"group-{gid}-")

    # One live room per group.
    assert (await start(client, alice, gid)).status_code == 400
    await join(client, bob, gid)
    assert (await start(client, bob, gid)).status_code == 400


async def test_active_and_listing(client, alice):
    group = await make_group(client, alice)
    gid = group["id"]
    assert (await client.get(f"/api/groups/{gid}/audio-sessions/active")).status_code == 404

    session = (await start(client, alice, gid)).json()
    active = await client.get(f"/api/groups/{gid}/audio-sessions/active")
    assert active.status_code == 200 and active.json()["id"] == session["id"]

    await client.post(f"/api/groups/{gid}/audio-sessions/{session['id']}/end", headers=alice)
    assert (await client.get(f"/api/groups/{gid}/audio-sessions/active")).status_code == 404

    again = (await start(client, alice, gid)).json()  # a new room can start after the old ended
    listing = (await client.get(f"/api/groups/{gid}/audio-sessions")).json()
    assert [s["id"] for s in listing] == [again["id"], session["id"]]  # newest first
    assert (await client.get(f"/api/groups/{gid}/audio-sessions?limit=0")).status_code == 422


async def test_database_blocks_a_second_live_session(client, alice):
    """Even if the router's check were skipped, the partial unique index holds."""
    from sqlalchemy.exc import IntegrityError

    import models
    from tests.conftest import TestSessionLocal

    group = await make_group(client, alice)
    await start(client, alice, group["id"])
    async with TestSessionLocal() as db:
        db.add(models.AudioSession(group_id=group["id"], started_by=1, room_name="dup-room"))
        with pytest.raises(IntegrityError):
            await db.commit()


# --- join / token -----------------------------------------------------------

async def test_join_not_configured_is_503(client, alice, monkeypatch):
    monkeypatch.setattr(settings, "livekit_api_key", None)
    group = await make_group(client, alice)
    session = (await start(client, alice, group["id"])).json()
    resp = await client.post(f"/api/groups/{group['id']}/audio-sessions/{session['id']}/join", headers=alice)
    assert resp.status_code == 503
    assert "aren't configured" in resp.json()["detail"]


async def test_join_rules(client, alice, bob, livekit):
    group = await make_group(client, alice)
    other = await make_group(client, alice, name="Other")
    gid = group["id"]
    session = (await start(client, alice, gid)).json()
    url = f"/api/groups/{gid}/audio-sessions/{session['id']}/join"

    assert (await client.post(url)).status_code == 401
    assert (await client.post(url, headers=bob)).status_code == 403  # not a member
    assert (await client.post(f"/api/groups/{gid}/audio-sessions/999/join", headers=alice)).status_code == 404
    # right id, wrong group
    assert (await client.post(f"/api/groups/{other['id']}/audio-sessions/{session['id']}/join", headers=alice)).status_code == 404

    await client.post(f"/api/groups/{gid}/audio-sessions/{session['id']}/end", headers=alice)
    assert (await client.post(url, headers=alice)).status_code == 400  # ended


async def test_token_claims(client, alice, livekit):
    group = await make_group(client, alice)
    session = (await start(client, alice, group["id"])).json()
    resp = await client.post(f"/api/groups/{group['id']}/audio-sessions/{session['id']}/join", headers=alice)
    assert resp.status_code == 200
    data = resp.json()
    assert data["url"] == "wss://example.livekit.test"
    assert data["room_name"] == session["room_name"]

    claims = jwt.decode(data["token"], SECRET, algorithms=["HS256"], options={"verify_aud": False})
    alice_id = (await client.get("/api/users/me", headers=alice)).json()["id"]
    assert claims["iss"] == "devkey"
    assert claims["sub"] == str(alice_id)
    assert claims["name"] == "alice"
    video = claims["video"]
    assert video["room"] == session["room_name"]
    assert video["roomJoin"] is True and video["canPublish"] is True and video["canSubscribe"] is True
    # explicit lifetime of ~2h, not the library default
    assert 7000 <= claims["exp"] - claims["nbf"] <= 7300


# --- end --------------------------------------------------------------------

async def test_end_rules_and_room_teardown(client, alice, bob, deleted_rooms):
    group = await make_group(client, alice)
    gid = group["id"]
    await join(client, bob, gid)
    session = (await start(client, bob, gid)).json()  # bob started it
    end_url = f"/api/groups/{gid}/audio-sessions/{session['id']}/end"

    carol_headers = await _outsider(client)
    assert (await client.post(end_url)).status_code == 401
    assert (await client.post(end_url, headers=carol_headers)).status_code == 403
    assert (await client.post(f"/api/groups/{gid}/audio-sessions/999/end", headers=bob)).status_code == 404

    # The group owner may end a room someone else started (so it can't get stuck).
    assert (await client.post(end_url, headers=alice)).status_code == 200
    assert deleted_rooms == [session["room_name"]]
    assert (await client.post(end_url, headers=alice)).status_code == 400  # already ended
    assert len(deleted_rooms) == 1


async def test_starter_can_end_own_room(client, alice, bob, deleted_rooms):
    group = await make_group(client, alice)
    gid = group["id"]
    await join(client, bob, gid)
    session = (await start(client, bob, gid)).json()
    resp = await client.post(f"/api/groups/{gid}/audio-sessions/{session['id']}/end", headers=bob)
    assert resp.status_code == 200
    assert deleted_rooms == [session["room_name"]]


async def test_member_who_did_not_start_cannot_end(client, alice, bob, deleted_rooms):
    group = await make_group(client, alice)
    gid = group["id"]
    await join(client, bob, gid)
    session = (await start(client, alice, gid)).json()  # alice (owner) started it
    resp = await client.post(f"/api/groups/{gid}/audio-sessions/{session['id']}/end", headers=bob)
    assert resp.status_code == 403
    assert deleted_rooms == []


async def _outsider(client):
    from tests.conftest import auth_headers

    return await auth_headers(client, "carol")
