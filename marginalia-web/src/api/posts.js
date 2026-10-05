import { api } from "./client";

// Group posts are created through the groups router (a post always belongs to
// a group) but edited and deleted through the flat posts router, same split as
// comments — see docs/ARCHITECTURE.md's route table.
export const listPosts = (groupId, { limit = 20, offset = 0 } = {}) =>
  api.get(`/api/groups/${groupId}/posts?limit=${limit}&offset=${offset}`);

export const createPost = (groupId, body) =>
  api.post(`/api/groups/${groupId}/posts`, { body });

export const updatePost = (postId, body) => api.patch(`/api/posts/${postId}`, { body });

export const deletePost = (postId) => api.del(`/api/posts/${postId}`);
