import { listBooks } from "./books";
import { getUsers } from "./users";

/**
 * `ReadingLogResponse` carries only `user_id` / `book_id` — no nested book or
 * user — so every feed, diary and review list needs the reader and the title
 * resolved before it can render a Review Card.
 *
 * Both `/api/books` and `/api/users` return their full collection, so the
 * join costs two requests total rather than one per row, and the results are
 * cached for the life of the page. `invalidateCatalog()` is called after any
 * mutation that adds a book or a user.
 */

let booksPromise = null;
let usersPromise = null;

function bookIndex(books) {
  const map = new Map();
  for (const book of books) map.set(book.id, book);
  return map;
}

function userIndex(users) {
  const map = new Map();
  for (const user of users) map.set(user.id, user);
  return map;
}

// Both endpoints 404 when their table is empty, which is a real state on a
// fresh database rather than an error worth surfacing.
async function tolerateEmpty(promise) {
  try {
    return await promise;
  } catch (err) {
    if (err.message === "No books found" || err.message === "No users found") {
      return [];
    }
    throw err;
  }
}

// A rejected promise must not be cached, or one transient failure poisons the
// catalogue for the rest of the page's life with no way to retry.
function cache(load, index) {
  const pending = tolerateEmpty(load()).then(index);
  pending.catch(() => {});
  return pending;
}

export function loadBooks() {
  if (!booksPromise) {
    booksPromise = cache(listBooks, bookIndex);
    booksPromise.catch(() => {
      booksPromise = null;
    });
  }
  return booksPromise;
}

export function loadUsers() {
  if (!usersPromise) {
    usersPromise = cache(getUsers, userIndex);
    usersPromise.catch(() => {
      usersPromise = null;
    });
  }
  return usersPromise;
}

export function invalidateCatalog() {
  booksPromise = null;
  usersPromise = null;
}

/** Attach `book` and `user` to each log, skipping ids already in cache. */
export async function hydrateLogs(logs) {
  if (!logs?.length) return [];
  const [books, users] = await Promise.all([loadBooks(), loadUsers()]);
  return logs.map((log) => ({
    ...log,
    book: books.get(log.book_id) ?? null,
    user: users.get(log.user_id) ?? null,
  }));
}
