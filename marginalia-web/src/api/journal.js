import { api } from "./client";

export function listJournal({ userId, bookId, limit = 20, offset = 0 } = {}) {
  const qs = new URLSearchParams({ limit, offset });
  if (userId) qs.set("user_id", userId);
  if (bookId) qs.set("book_id", bookId);
  return api.get(`/api/journal?${qs}`);
}

// The caller's own entries, drafts included.
export function myJournal() {
  return api.get("/api/journal/mine");
}

export function getEntry(entryId) {
  return api.get(`/api/journal/${entryId}`);
}

export function createEntry(payload) {
  return api.post("/api/journal", payload);
}

export function updateEntry(entryId, payload) {
  return api.patch(`/api/journal/${entryId}`, payload);
}

export function deleteEntry(entryId) {
  return api.del(`/api/journal/${entryId}`);
}
