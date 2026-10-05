import { api, wsUrl, authToken } from "./client";

/**
 * Chat history, newest first from the backend (created_at desc). Members only:
 * the backend answers 403 to anyone else.
 */
export const listMessages = (groupId, { limit = 50, offset = 0 } = {}) =>
  api.get(`/api/groups/${groupId}/messages?limit=${limit}&offset=${offset}`);

/**
 * The two transports disagree on shape, so normalize at the boundary.
 *
 *   GET /messages  ->  {id, group_id, user_id, body, created_at, author: UserPublic}
 *   WS broadcast   ->  {id, group_id, user_id, body, created_at, username, avatar_url}
 *
 * Both collapse to {id, body, created_at, user: {id, username, avatar_url}} so
 * the Scriptorium renders history and live messages through one code path.
 */
export function normalizeMessage(raw) {
  if (!raw || raw.id == null) return null;
  return {
    id: raw.id,
    body: raw.body,
    created_at: raw.created_at,
    user: {
      id: raw.user_id,
      username: raw.author?.username ?? raw.username ?? "Unknown",
      avatar_url: raw.author?.avatar_url ?? raw.avatar_url ?? null,
    },
  };
}

/**
 * Merge incoming messages into a list: de-duplicated by id and ordered oldest
 * first. History (REST) and live (WebSocket) both feed the same list, and a
 * message can legitimately arrive through both, in either order.
 */
export function mergeMessages(current, incoming) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id,
  );
}

/** Close codes the backend uses. */
export const CLOSE_UNAUTHORIZED = 4401; // bad/expired token
export const CLOSE_FORBIDDEN = 4403; // not (or no longer) a member
export const CLOSE_GONE = 4404; // the group was deleted
export const CLOSE_THROTTLED = 4408; // sending too fast

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 15000;

/**
 * The Scriptorium's live channel: one connection that heals itself.
 *
 * - Reconnects with exponential backoff + jitter after any unexpected drop,
 *   and immediately when the browser comes back online.
 * - Stops for good on 4403 (not a member) and 4404 (group deleted); on a
 *   failed handshake or 4401 it checks the session so an expired login
 *   redirects to /login instead of retrying forever.
 * - `onReconnected` fires after a *re*connect so the caller can backfill
 *   whatever was said while the socket was down.
 *
 * Note a browser never sees 4401/4403 on a rejected handshake (the server
 * closes before accepting, which looks like a plain failure, code 1006), so
 * membership gating is decided from the roster, not from the close code.
 *
 * Returns { send(body) -> boolean, reconnectNow(), close() }.
 */
export function openChat(groupId, { onMessage, onStatus, onError, onReconnected } = {}) {
  let socket = null;
  let timer = null;
  let attempts = 0;
  let everOpened = false;
  let closedByUs = false;

  const status = (s) => !closedByUs && onStatus?.(s);

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function detach(s) {
    if (!s) return;
    s.onopen = s.onmessage = s.onerror = s.onclose = null;
    if (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING) s.close();
  }

  function scheduleReconnect() {
    clearTimer();
    status("reconnecting");
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempts) + Math.random() * 400;
    attempts += 1;
    timer = setTimeout(connect, delay);
  }

  async function sessionStillValid() {
    // client.js redirects to /login on a 401; any other outcome means the login is fine.
    try {
      await api.get("/api/users/me");
    } catch {
      /* network down or server error: not an auth problem */
    }
  }

  function connect() {
    clearTimer();
    if (closedByUs) return;
    detach(socket); // never leave an old socket alive behind a new one

    const token = authToken();
    if (!token) {
      status("unauthenticated");
      return;
    }

    status(everOpened ? "reconnecting" : "connecting");
    let opened = false;
    let s;
    try {
      s = new WebSocket(wsUrl(`/api/groups/${groupId}/ws`, token));
    } catch {
      status("error");
      scheduleReconnect();
      return;
    }
    socket = s;

    s.onopen = () => {
      opened = true;
      const wasReconnect = everOpened;
      everOpened = true;
      attempts = 0;
      status("open");
      if (wasReconnect) onReconnected?.();
    };

    s.onmessage = (event) => {
      let parsed;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      if (parsed?.type === "error") {
        onError?.(parsed.detail ?? "The room rejected that message.");
        return;
      }
      const message = normalizeMessage(parsed);
      if (message) onMessage?.(message);
    };

    s.onerror = () => {
      /* onclose always follows; handle everything there */
    };

    s.onclose = (event) => {
      if (closedByUs || socket !== s) return;
      if (event.code === CLOSE_FORBIDDEN) return status("forbidden");
      if (event.code === CLOSE_GONE) {
        onError?.("This group no longer exists.");
        return status("forbidden");
      }
      if (event.code === CLOSE_UNAUTHORIZED) {
        status("unauthenticated");
        sessionStillValid();
        return;
      }
      if (event.code === CLOSE_THROTTLED) onError?.("You're sending messages too fast. Slow down a little.");
      if (!opened) sessionStillValid(); // failed handshake: expired login? membership?
      scheduleReconnect();
    };
  }

  const onOnline = () => {
    if (!closedByUs && socket?.readyState !== WebSocket.OPEN) {
      attempts = 0;
      connect();
    }
  };
  window.addEventListener("online", onOnline);

  connect();

  return {
    /** True if the line went out; false if the socket isn't open. */
    send(body) {
      if (socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(body);
      return true;
    },
    reconnectNow() {
      attempts = 0;
      connect();
    },
    close() {
      closedByUs = true;
      clearTimer();
      window.removeEventListener("online", onOnline);
      detach(socket);
      socket = null;
    },
  };
}
