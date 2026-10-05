import logging
import time
import uuid
from collections import deque
from datetime import datetime, timedelta, UTC
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from livekit import api
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import models
from auth import get_current_user, verify_access_token
from chat import manager
from config import settings
from database import get_db
from permissions import check_ownership
from schemas import (
    GroupResponse,
    GroupCreate,
    GroupUpdate,
    GroupMemberResponse,
    PostResponse,
    PostCreate,
    MessageResponse,
    AudioSessionResponse,
    LiveKitTokenResponse,
)

router = APIRouter()
logger = logging.getLogger("athenaeum.groups")

# Chat limits. Module-level so tests can shrink them.
MAX_MESSAGE_LENGTH = 2000
RATE_LIMIT_MESSAGES = 20  # per connection...
RATE_LIMIT_WINDOW = 10.0  # ...per this many seconds; beyond that the socket is closed (4408)
LIVEKIT_TOKEN_TTL = timedelta(hours=2)


async def _get_membership(group_id: int, user_id: int, db: AsyncSession) -> models.GroupMember | None:
    result = await db.execute(
        select(models.GroupMember).where(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == user_id,
        ),
    )
    return result.scalars().first()


def _build_livekit_token(room_name: str, user: models.User) -> str:
    if not (settings.livekit_api_key and settings.livekit_api_secret and settings.livekit_url):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Audio rooms aren't configured yet. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET and LIVEKIT_URL in .env.",
        )

    return (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret.get_secret_value())
        .with_identity(str(user.id))
        .with_name(user.username)
        .with_grants(
            api.VideoGrants(room_join=True, room=room_name, can_publish=True, can_subscribe=True)
        )
        .with_ttl(LIVEKIT_TOKEN_TTL)
        .to_jwt()
    )


async def _delete_livekit_room(room_name: str) -> None:
    """Best-effort: tear down the media room so participants are disconnected
    and already-issued tokens stop being useful. Never fails the request."""
    if not (settings.livekit_api_key and settings.livekit_api_secret and settings.livekit_url):
        return
    try:
        lk = api.LiveKitAPI(
            settings.livekit_url,
            settings.livekit_api_key,
            settings.livekit_api_secret.get_secret_value(),
        )
        try:
            await lk.room.delete_room(api.DeleteRoomRequest(room=room_name))
        finally:
            await lk.aclose()
    except Exception:
        logger.warning("could not delete LiveKit room %s", room_name, exc_info=True)


@router.get("", response_model=list[GroupResponse])
async def get_groups(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    result = await db.execute(
        select(models.Group).order_by(models.Group.created_at.desc()).limit(limit).offset(offset),
    )
    return result.scalars().all()


@router.get("/{group_id}", response_model=GroupResponse)
async def get_group(group_id: int, db: Annotated[AsyncSession, Depends(get_db)]):
    result = await db.execute(select(models.Group).where(models.Group.id == group_id))
    group = result.scalars().first()

    if group:
        return group

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")


@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    group: GroupCreate,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    new_group = models.Group(
        name=group.name,
        description=group.description,
        owner_id=current_user.id,
    )
    db.add(new_group)
    await db.flush()

    owner_membership = models.GroupMember(group_id=new_group.id, user_id=current_user.id, role="owner")
    db.add(owner_membership)

    await db.commit()
    await db.refresh(new_group)

    return new_group


@router.patch("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: int,
    group_data: GroupUpdate,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(models.Group).where(models.Group.id == group_id))
    group = result.scalars().first()

    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    check_ownership(group.owner_id, current_user, "Not authorized to update this group")

    update_data = group_data.model_dump(exclude_unset=True)
    if update_data.get("name") is None:
        # name is NOT NULL: an explicit null means "leave it", not "erase it".
        update_data.pop("name", None)
    for field, value in update_data.items():
        setattr(group, field, value)

    await db.commit()
    await db.refresh(group)
    return group


@router.delete("/{group_id}")
async def delete_group(
    group_id: int,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(models.Group).where(models.Group.id == group_id))
    group = result.scalars().first()

    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    check_ownership(group.owner_id, current_user, "Not authorized to delete this group")

    # Children are removed explicitly so this behaves the same on SQLite and
    # Postgres (the FKs also carry ON DELETE CASCADE as a backstop).
    for child in (models.Message, models.Post, models.AudioSession, models.GroupMember):
        await db.execute(delete(child).where(child.group_id == group_id))
    await db.delete(group)
    await db.commit()
    await manager.close_group(group_id)
    return {"message": "Group deleted successfully"}


# Members
@router.get("/{group_id}/members", response_model=list[GroupMemberResponse])
async def get_group_members(group_id: int, db: Annotated[AsyncSession, Depends(get_db)]):
    result = await db.execute(
        select(models.GroupMember)
        .options(selectinload(models.GroupMember.user))
        .where(models.GroupMember.group_id == group_id),
    )
    return result.scalars().all()


@router.post("/{group_id}/members", status_code=status.HTTP_201_CREATED)
async def join_group(
    group_id: int,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(models.Group).where(models.Group.id == group_id))
    if not result.scalars().first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    result = await db.execute(
        select(models.GroupMember).where(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        ),
    )
    existing_member = result.scalars().first()
    if existing_member:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already a member of this group")

    new_member = models.GroupMember(group_id=group_id, user_id=current_user.id, role="member")
    db.add(new_member)
    try:
        await db.commit()
    except IntegrityError:
        # Two simultaneous joins both passed the check above; the unique
        # constraint caught the second one.
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already a member of this group")
    return {"message": "Joined"}


@router.delete("/{group_id}/members/me")
async def leave_group(
    group_id: int,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(models.GroupMember).where(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id,
        ),
    )
    member = result.scalars().first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not a member of this group")

    if member.role == "owner":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group owner cannot leave — delete the group instead")

    await db.delete(member)
    await db.commit()
    # A former member must not keep receiving (or sending) live chat.
    await manager.close_user(group_id, current_user.id, 4403)
    return {"message": "Left group"}


# Posts in a group
@router.get("/{group_id}/posts", response_model=list[PostResponse])
async def get_group_posts(
    group_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    result = await db.execute(
        select(models.Post)
        .options(selectinload(models.Post.author))
        .where(models.Post.group_id == group_id)
        .order_by(models.Post.created_at.desc())
        .limit(limit)
        .offset(offset),
    )
    return result.scalars().all()


@router.post("/{group_id}/posts", response_model=PostResponse, status_code=status.HTTP_201_CREATED)
async def create_group_post(
    group_id: int,
    post: PostCreate,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(models.Group).where(models.Group.id == group_id))
    if not result.scalars().first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if not await _get_membership(group_id, current_user.id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be a member of this group to post")

    new_post = models.Post(
        group_id=group_id,
        user_id=current_user.id,
        body=post.body,
        author=current_user,
    )
    db.add(new_post)
    await db.commit()
    await db.refresh(new_post)

    return new_post


# --- Phase 2: real-time layer ---

# Message history (the live feed itself comes over the websocket below)
@router.get("/{group_id}/messages", response_model=list[MessageResponse])
async def get_group_messages(
    group_id: int,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    if not await _get_membership(group_id, current_user.id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be a member of this group")

    result = await db.execute(
        select(models.Message)
        .options(selectinload(models.Message.author))
        .where(models.Message.group_id == group_id)
        .order_by(models.Message.created_at.desc())
        .limit(limit)
        .offset(offset),
    )
    return result.scalars().all()


async def _chat_error(websocket: WebSocket, detail: str) -> None:
    await websocket.send_json({"type": "error", "detail": detail})


@router.websocket("/{group_id}/ws")
async def group_chat(
    websocket: WebSocket,
    group_id: int,
    token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # browsers can't set custom headers on a WebSocket handshake, so the
    # token rides in as a query param instead of the usual Authorization header
    user_id = verify_access_token(token)
    if user_id is None:
        await websocket.close(code=4401)
        return

    try:
        user_id_int = int(user_id)
    except (TypeError, ValueError):
        await websocket.close(code=4401)
        return

    result = await db.execute(select(models.User).where(models.User.id == user_id_int))
    user = result.scalars().first()
    if not user:
        await websocket.close(code=4401)
        return

    if not await _get_membership(group_id, user.id, db):
        await websocket.close(code=4403)
        return

    # Copy what we need as plain values, then end the read transaction: the
    # session lives as long as the socket, and an idle connection must not pin
    # a pooled DB connection while it waits for the next frame.
    uid, username, avatar_url = user.id, user.username, user.avatar_url
    await db.rollback()

    await websocket.accept()
    manager.connect(group_id, websocket, uid)
    logger.info("chat connect group=%s user=%s", group_id, uid)
    sent_at: deque[float] = deque()
    try:
        while True:
            frame = await websocket.receive()
            if frame["type"] == "websocket.disconnect":
                break

            body = frame.get("text")
            if body is None:
                await _chat_error(websocket, "Only text messages are supported.")
                continue
            body = body.strip()
            if not body:
                await _chat_error(websocket, "Message is empty.")
                continue
            if len(body) > MAX_MESSAGE_LENGTH:
                await _chat_error(websocket, f"Message is too long (max {MAX_MESSAGE_LENGTH} characters).")
                continue

            now = time.monotonic()
            while sent_at and now - sent_at[0] > RATE_LIMIT_WINDOW:
                sent_at.popleft()
            if len(sent_at) >= RATE_LIMIT_MESSAGES:
                await websocket.close(code=4408)  # slow down
                break
            sent_at.append(now)

            # Membership can end mid-connection (leave/removal): re-check per message.
            if not await _get_membership(group_id, uid, db):
                await websocket.close(code=4403)
                break

            new_message = models.Message(group_id=group_id, user_id=uid, body=body)
            db.add(new_message)
            try:
                await db.commit()
            except Exception:
                await db.rollback()
                logger.exception("could not save chat message group=%s user=%s", group_id, uid)
                await _chat_error(websocket, "Could not save your message. Try again.")
                continue

            # created_at is a client-side default, so it is set without a refresh
            # (which would reopen a transaction). SQLite drops tzinfo on read-back
            # even though this was written as UTC; stamp it by hand since this
            # payload is built manually rather than through a response model.
            created_at = new_message.created_at
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=UTC)

            await manager.broadcast(group_id, {
                "id": new_message.id,
                "group_id": group_id,
                "user_id": uid,
                "username": username,
                "avatar_url": avatar_url,
                "body": body,
                "created_at": created_at.isoformat(),
            })
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(group_id, websocket)
        logger.info("chat disconnect group=%s user=%s", group_id, uid)


# Audio rooms (LiveKit) — bookkeeping lives here, actual media never touches this server
@router.get("/{group_id}/audio-sessions/active", response_model=AudioSessionResponse)
async def get_active_audio_session(group_id: int, db: Annotated[AsyncSession, Depends(get_db)]):
    result = await db.execute(
        select(models.AudioSession).where(
            models.AudioSession.group_id == group_id,
            models.AudioSession.ended_at.is_(None),
        ),
    )
    session = result.scalars().first()
    if session:
        return session

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active audio session for this group")


@router.get("/{group_id}/audio-sessions", response_model=list[AudioSessionResponse])
async def get_audio_sessions(
    group_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    result = await db.execute(
        select(models.AudioSession)
        .where(models.AudioSession.group_id == group_id)
        .order_by(models.AudioSession.started_at.desc())
        .limit(limit)
        .offset(offset),
    )
    return result.scalars().all()


@router.post("/{group_id}/audio-sessions", response_model=AudioSessionResponse, status_code=status.HTTP_201_CREATED)
async def start_audio_session(
    group_id: int,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(models.Group).where(models.Group.id == group_id))
    if not result.scalars().first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if not await _get_membership(group_id, current_user.id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be a member of this group")

    result = await db.execute(
        select(models.AudioSession).where(
            models.AudioSession.group_id == group_id,
            models.AudioSession.ended_at.is_(None),
        ),
    )
    existing_session = result.scalars().first()
    if existing_session:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An audio session is already active for this group")

    new_session = models.AudioSession(
        group_id=group_id,
        started_by=current_user.id,
        room_name=f"group-{group_id}-{uuid.uuid4().hex[:12]}",
    )
    db.add(new_session)
    try:
        await db.commit()
    except IntegrityError:
        # The partial unique index caught a simultaneous second start.
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An audio session is already active for this group")
    await db.refresh(new_session)

    return new_session


@router.post("/{group_id}/audio-sessions/{session_id}/join", response_model=LiveKitTokenResponse)
async def join_audio_session(
    group_id: int,
    session_id: int,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(models.AudioSession).where(
            models.AudioSession.id == session_id,
            models.AudioSession.group_id == group_id,
        ),
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio session not found")

    if session.ended_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This audio session has ended")

    if not await _get_membership(group_id, current_user.id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be a member of this group")

    token = _build_livekit_token(session.room_name, current_user)
    return LiveKitTokenResponse(token=token, url=settings.livekit_url, room_name=session.room_name)


@router.post("/{group_id}/audio-sessions/{session_id}/end")
async def end_audio_session(
    group_id: int,
    session_id: int,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(models.AudioSession).where(
            models.AudioSession.id == session_id,
            models.AudioSession.group_id == group_id,
        ),
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio session not found")

    # The person who started the room, or the group's owner (so a room can never
    # get stuck if its starter has gone), may end it.
    if session.started_by != current_user.id:
        group = await db.get(models.Group, group_id)
        check_ownership(group.owner_id if group else -1, current_user, "Not authorized to end this audio session")

    if session.ended_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Audio session already ended")

    session.ended_at = datetime.now(UTC)
    room_name = session.room_name
    await db.commit()
    await _delete_livekit_room(room_name)
    return {"message": "Audio session ended"}
