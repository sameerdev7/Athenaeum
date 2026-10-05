import { api } from "./client";

// An empty catalogue is a real state, not a failure: the endpoint 404s with
// "No books found" rather than returning []. Callers get an empty list.
export async function listBooks() {
  try {
    return await api.get("/api/books");
  } catch (err) {
    if (err.message === "No books found") return [];
    throw err;
  }
}

export function getBook(bookId) {
  return api.get(`/api/books/${bookId}`);
}

// Content-based recommendations, ranked by the server with a `similarity`
// score per result. Public and best-effort: an empty list is a real answer
// (a book with nothing textually close to it), not a failure.
export function getSimilarBooks(bookId, limit = 6) {
  return api.get(`/api/books/${bookId}/similar?limit=${limit}`);
}

// Open Library proxy. A failed upstream call surfaces as 502, not a crash.
export function searchExternalBooks(q) {
  return api.get(`/api/books/search-external?q=${encodeURIComponent(q)}`);
}

export function createBook(payload) {
  return api.post("/api/books", payload);
}

export function updateBook(bookId, payload) {
  return api.patch(`/api/books/${bookId}`, payload);
}

export function deleteBook(bookId) {
  return api.del(`/api/books/${bookId}`);
}
