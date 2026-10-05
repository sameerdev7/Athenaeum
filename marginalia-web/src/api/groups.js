import { api } from "./client";

export const listGroups = ({ limit = 20, offset = 0 } = {}) =>
  api.get(`/api/groups?limit=${limit}&offset=${offset}`);

export const getGroup = (id) => api.get(`/api/groups/${id}`);

export const createGroup = (body) => api.post("/api/groups", body);

export const updateGroup = (id, body) => api.patch(`/api/groups/${id}`, body);

export const deleteGroup = (id) => api.del(`/api/groups/${id}`);

/** GroupMemberResponse rows, each with a nested `user`. */
export const listMembers = (id) => api.get(`/api/groups/${id}/members`);

/** The backend answers with {"message": "Joined"}; a repeat join is a 400. */
export const joinGroup = (id) => api.post(`/api/groups/${id}/members`);

/**
 * Leave is `DELETE /{id}/members/me` — there is no per-member route, so the
 * backend infers which row to drop from the token.
 */
export const leaveGroup = (id) => api.del(`/api/groups/${id}/members/me`);

export const isMember = (members, userId) =>
  userId != null && members.some((m) => m.user?.id === userId);

export const isGroupOwner = (group, userId) =>
  userId != null && group?.owner_id === userId;
