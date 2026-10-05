import { api } from "./client";

export function getLogs(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  }
  const query = qs.toString();
  return api.get(`/api/logs${query ? `?${query}` : ""}`);
}

export function getFeed({ limit = 20, offset = 0 } = {}) {
  return api.get(`/api/logs/feed?limit=${limit}&offset=${offset}`);
}

// Books the people you follow logged recently, with who and how many.
export function getFriendsPopular({ days = 90, limit = 12 } = {}) {
  return api.get(`/api/logs/friends/popular?days=${days}&limit=${limit}`);
}

export function getLog(logId) {
  return api.get(`/api/logs/${logId}`);
}

export function createLog(payload) {
  return api.post("/api/logs", payload);
}

export function updateLog(logId, payload) {
  return api.patch(`/api/logs/${logId}`, payload);
}

export function deleteLog(logId) {
  return api.del(`/api/logs/${logId}`);
}

export function getComments(logId) {
  return api.get(`/api/logs/${logId}/comments`);
}

export function createComment(logId, body, parentId = null) {
  return api.post(`/api/logs/${logId}/comments`, { body, parent_id: parentId });
}

export function deleteComment(commentId) {
  return api.del(`/api/comments/${commentId}`);
}

// Likes are a bare join table with no id in the response, so "did I like
// this?" is derived by intersecting the liker list with the current user.
export function getLikes(logId) {
  return api.get(`/api/logs/${logId}/likes`);
}

export function likeLog(logId) {
  return api.post(`/api/logs/${logId}/like`);
}

export function unlikeLog(logId) {
  return api.del(`/api/logs/${logId}/like`);
}
