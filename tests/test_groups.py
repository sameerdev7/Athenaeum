"""Groups, membership, posts and message history.

Covers CRUD + ownership, membership edge cases, cascade deletion, the posts
router, and the (members-only) chat history endpoint.
"""

from sqlalchemy import func, select

import models
from tests.conftest import TestSessionLocal


async def _user_id(client, headers):
    return (await client.get("/api/users/me", headers=headers)).json()["id"]


async def make_group(client, headers, name="Reading Room", **extra):
    resp = await client.post("/api/groups", json={"name": name, **extra}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def join(client, headers, group_id):
    resp = await client.post(f"/api/groups/{group_id}/members", headers=headers)
    assert resp.status_code == 201, resp.text


# --- CRUD -------------------------------------------------------------------

async def test_create_requires_auth_and_validates(client, alice):
    assert (await client.post("/api/groups", json={"name": "x"})).status_code == 401
    assert (await client.post("/api/groups", json={"name": ""}, headers=alice)).status_code == 422
    assert (await client.post("/api/groups", json={"name": "n" * 101}, headers=alice)).status_code == 422


async def test_get_list_and_pagination(client, alice):
    for i in range(3):
        await make_group(client, alice, name=f"Group {i}")
    one = await client.get("/api/groups/1")
    assert one.status_code == 200 and one.json()["name"] == "Group 0"
    assert (await client.get("/api/groups/999")).status_code == 404

    page = await client.get("/api/groups?limit=2")
    assert len(page.json()) == 2
    rest = await client.get("/api/groups?limit=2&offset=2")
    assert len(rest.json()) == 1
    assert (await client.get("/api/groups?limit=0")).status_code == 422
    assert (await client.get("/api/groups?limit=101")).status_code == 422


async def test_patch_owner_only_and_null_name_is_ignored(client, alice, bob):
    group = await make_group(client, alice, name="Original", description="d")
    url = f"/api/groups/{group['id']}"

    assert (await client.patch(url, json={"name": "Hijack"}, headers=bob)).status_code == 403
    assert (await client.patch("/api/groups/999", json={"name": "x"}, headers=alice)).status_code == 404

    ok = await client.patch(url, json={"name": "Renamed"}, headers=alice)
    assert ok.status_code == 200 and ok.json()["name"] == "Renamed"

    # An explicit null must not blow up (name is NOT NULL) — it means "leave it".
    nulled = await client.patch(url, json={"name": None, "description": "new"}, headers=alice)
    assert nulled.status_code == 200
    assert nulled.json()["name"] == "Renamed" and nulled.json()["description"] == "new"


async def test_delete_is_owner_only_and_cascades(client, alice, bob):
    group = await make_group(client, alice)
    gid = group["id"]
    await join(client, bob, gid)
    await client.post(f"/api/groups/{gid}/posts", json={"body": "hello"}, headers=bob)
    await client.post(f"/api/groups/{gid}/audio-sessions", headers=alice)
    async with TestSessionLocal() as db:
        db.add(models.Message(group_id=gid, user_id=await _user_id(client, alice), body="hi"))
        await db.commit()

    assert (await client.delete(f"/api/groups/{gid}", headers=bob)).status_code == 403
    assert (await client.delete(f"/api/groups/{gid}", headers=alice)).status_code == 200
    assert (await client.get(f"/api/groups/{gid}")).status_code == 404

    async with TestSessionLocal() as db:
        for model in (models.GroupMember, models.Post, models.Message, models.AudioSession):
            count = (await db.execute(select(func.count()).select_from(model).where(model.group_id == gid))).scalar_one()
            assert count == 0, f"{model.__name__} rows left behind"


# --- members ----------------------------------------------------------------

async def test_owner_is_member_and_roster_lists_members(client, alice, bob):
    group = await make_group(client, alice)
    await join(client, bob, group["id"])
    roster = (await client.get(f"/api/groups/{group['id']}/members")).json()
    assert {(m["user"]["username"], m["role"]) for m in roster} == {("alice", "owner"), ("bob", "member")}


async def test_join_and_leave_edge_cases(client, alice, bob):
    group = await make_group(client, alice)
    gid = group["id"]
    assert (await client.post("/api/groups/999/members", headers=bob)).status_code == 404
    assert (await client.post(f"/api/groups/{gid}/members")).status_code == 401

    await join(client, bob, gid)
    assert (await client.post(f"/api/groups/{gid}/members", headers=bob)).status_code == 400  # already in

    assert (await client.delete(f"/api/groups/{gid}/members/me", headers=alice)).status_code == 400  # owner
    assert (await client.delete(f"/api/groups/{gid}/members/me", headers=bob)).status_code == 200
    assert (await client.delete(f"/api/groups/{gid}/members/me", headers=bob)).status_code == 404  # no longer in


# --- posts ------------------------------------------------------------------

async def test_post_rules(client, alice, bob):
    group = await make_group(client, alice)
    gid = group["id"]
    url = f"/api/groups/{gid}/posts"

    assert (await client.post(url, json={"body": "hi"})).status_code == 401
    assert (await client.post(url, json={"body": "hi"}, headers=bob)).status_code == 403  # not a member
    assert (await client.post("/api/groups/999/posts", json={"body": "hi"}, headers=alice)).status_code == 404
    assert (await client.post(url, json={"body": ""}, headers=alice)).status_code == 422
    assert (await client.post(url, json={"body": "x" * 5001}, headers=alice)).status_code == 422

    first = await client.post(url, json={"body": "first"}, headers=alice)
    await join(client, bob, gid)
    second = await client.post(url, json={"body": "second"}, headers=bob)
    assert first.status_code == second.status_code == 201
    assert second.json()["author"]["username"] == "bob"

    listing = (await client.get(url)).json()
    assert [p["body"] for p in listing] == ["second", "first"]  # newest first
    assert len((await client.get(f"{url}?limit=1")).json()) == 1


async def test_posts_router_author_only_edit_delete(client, alice, bob):
    group = await make_group(client, alice)
    await join(client, bob, group["id"])
    post = (await client.post(f"/api/groups/{group['id']}/posts", json={"body": "mine"}, headers=bob)).json()
    url = f"/api/posts/{post['id']}"

    assert (await client.get(url)).status_code == 200
    assert (await client.patch(url, json={"body": "hack"}, headers=alice)).status_code == 403
    assert (await client.delete(url, headers=alice)).status_code == 403
    assert (await client.patch(url, json={"body": "edited"}, headers=bob)).json()["body"] == "edited"
    assert (await client.delete(url, headers=bob)).status_code == 200
    assert (await client.get(url)).status_code == 404
    assert (await client.get("/api/posts/999")).status_code == 404


# --- chat history -----------------------------------------------------------

async def test_message_history_is_members_only_ordered_and_paginated(client, alice, bob):
    group = await make_group(client, alice)
    gid = group["id"]
    alice_id = await _user_id(client, alice)
    async with TestSessionLocal() as db:
        for n in range(3):
            db.add(models.Message(group_id=gid, user_id=alice_id, body=f"m{n}"))
        await db.commit()

    url = f"/api/groups/{gid}/messages"
    assert (await client.get(url)).status_code == 401  # anonymous
    assert (await client.get(url, headers=bob)).status_code == 403  # signed in, not a member

    rows = (await client.get(url, headers=alice)).json()
    assert [m["body"] for m in rows] == ["m2", "m1", "m0"]  # newest first
    assert rows[0]["author"]["username"] == "alice"
    assert len((await client.get(f"{url}?limit=2", headers=alice)).json()) == 2
    assert (await client.get(f"{url}?limit=0", headers=alice)).status_code == 422


async def test_third_party_cannot_see_group_via_other_group(client, alice, bob):
    """Membership is per group: being in group A doesn't open group B's history."""
    a = await make_group(client, alice, name="A")
    b = await make_group(client, bob, name="B")
    assert (await client.get(f"/api/groups/{b['id']}/messages", headers=alice)).status_code == 403
    assert (await client.get(f"/api/groups/{a['id']}/messages", headers=alice)).status_code == 200
