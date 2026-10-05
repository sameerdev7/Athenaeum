import { api } from "./client";

export function getLists({ userId, limit = 20, offset = 0 } = {}) {
  const qs = new URLSearchParams({ limit, offset });
  if (userId) qs.set("user_id", userId);
  return api.get(`/api/lists?${qs}`);
}

export function getList(listId) {
  return api.get(`/api/lists/${listId}`);
}

export function createList(payload) {
  return api.post("/api/lists", payload);
}

export function updateList(listId, payload) {
  return api.patch(`/api/lists/${listId}`, payload);
}

export function deleteList(listId) {
  return api.del(`/api/lists/${listId}`);
}

// Items come back with the full book nested (and the book's owner), so a
// list's poster grid needs no extra hydration.
export function getListItems(listId) {
  return api.get(`/api/lists/${listId}/items`);
}

export function addListItem(listId, payload) {
  return api.post(`/api/lists/${listId}/items`, payload);
}

export function updateListItem(listId, itemId, payload) {
  return api.patch(`/api/lists/${listId}/items/${itemId}`, payload);
}

export function deleteListItem(listId, itemId) {
  return api.del(`/api/lists/${listId}/items/${itemId}`);
}
