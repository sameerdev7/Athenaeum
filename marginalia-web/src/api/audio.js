import { api } from "./client";

/**
 * Audio rooms are three calls, not one, on purpose (docs/ARCHITECTURE.md):
 * "start" creates the bookkeeping row, "join" mints a LiveKit token for the
 * caller, and "end" is starter-only. The starter calls start then join like
 * everyone else, so both paths return the same shape.
 */

/** One active session per group; 404 means the room is empty. */
export const getActiveSession = (groupId) =>
  api.get(`/api/groups/${groupId}/audio-sessions/active`);

export const listSessions = (groupId, { limit = 20, offset = 0 } = {}) =>
  api.get(`/api/groups/${groupId}/audio-sessions?limit=${limit}&offset=${offset}`);

export const startSession = (groupId) => api.post(`/api/groups/${groupId}/audio-sessions`);

/**
 * Returns {token, url, room_name}. Throws a 503 while LiveKit credentials are
 * unset, which is the expected state until a LiveKit Cloud project exists —
 * callers should treat that as "not ready", not as a failure to crash on.
 */
export const joinSession = (groupId, sessionId) =>
  api.post(`/api/groups/${groupId}/audio-sessions/${sessionId}/join`);

/** Starter-only (check_ownership against session.started_by). */
export const endSession = (groupId, sessionId) =>
  api.post(`/api/groups/${groupId}/audio-sessions/${sessionId}/end`);

/** 404 from getActiveSession is the normal "no room" answer, not an error. */
export function isNotConfigured(err) {
  return /aren't configured/i.test(err?.message ?? "");
}
