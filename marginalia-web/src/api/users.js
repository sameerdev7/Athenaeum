import { api } from "./client";

// "Following" and "followers" are opposite directions, not synonyms — see
// Profile.jsx's isFollowing check for the mistake that's easy to make here:
// whether *I* follow someone is answered by their followers list, not mine.

export function getUsers() {
  return api.get("/api/users");
}

export function getUser(userId) {
  return api.get(`/api/users/${userId}`);
}

export function getMe() {
  return api.get("/api/users/me");
}

export function updateUser(userId, payload) {
  return api.patch(`/api/users/${userId}`, payload);
}

export function uploadAvatar(file) {
  const form = new FormData();
  form.append("file", file);
  return api.upload("/api/users/me/avatar", form);
}

export function forgotPassword(email) {
  return api.post("/api/users/forgot-password", { email }, { auth: false });
}

export function resetPassword(token, password) {
  return api.post("/api/users/reset-password", { token, password }, { auth: false });
}

export function followUser(userId) {
  return api.post(`/api/users/${userId}/follow`);
}

export function unfollowUser(userId) {
  return api.del(`/api/users/${userId}/follow`);
}

export function getFollowers(userId) {
  return api.get(`/api/users/${userId}/followers`);
}

export function getFollowing(userId) {
  return api.get(`/api/users/${userId}/following`);
}
