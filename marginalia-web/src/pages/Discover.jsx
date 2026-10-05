import { useEffect, useMemo, useState } from "react";
import { listBooks } from "../api/books";
import { BookCard } from "../components/BookCard";
import Hero from "../components/Hero";
import {
  Button,
  EmptyState,
  ErrorNote,
  Input,
  Select,
  Spinner,
} from "../components/ui";

// Poster grid: 2 (phone) -> 4 (tablet) -> 6 (desktop), gap 1rem.
const GRID = "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";

/** Sort choices. Anything that isn't a text field is compared numerically. */
const SORTS = [
  { value: "title-asc", label: "Title (A–Z)", compare: (a, b) => a.title.localeCompare(b.title) },
  { value: "author-asc", label: "Author (A–Z)", compare: (a, b) => a.author.localeCompare(b.author) },
  { value: "year-desc", label: "Year (newest first)", compare: (a, b) => b.year - a.year },
  { value: "year-asc", label: "Year (oldest first)", compare: (a, b) => a.year - b.year },
];

const byTitle = SORTS[0].compare;
const DEFAULT_SORT = SORTS[0].value;

/**
 * The catalogue landing page — GET /api/books, no auth required. Genre chips
 * are derived from whatever's actually in the response (`new Set` over
 * `book.genre`) rather than a hardcoded list, so a new genre added anywhere
 * (seed script, AddBook's dropdown) shows up here automatically.
 *
 * Search, genre and sort all run in the browser: the endpoint already returns
 * the whole catalogue (195 books, ~12 genres), so paging it server-side would
 * only add a round trip per keystroke. Search and genre are ANDed — a query
 * narrows within the chosen genre rather than replacing it — and sort is
 * applied to whatever survives, never to the full set.
 */
export default function Discover() {
  const [books, setBooks] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("all");
  const [sort, setSort] = useState(DEFAULT_SORT);

  useEffect(() => {
    document.title = "Discover • Athenaeum";
    let cancelled = false;
    listBooks()
      .then((data) => {
        if (!cancelled) setBooks(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setBooks([]);
          setError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const genres = useMemo(
    () => (books ? [...new Set(books.map((b) => b.genre))].sort((a, b) => a.localeCompare(b)) : []),
    [books],
  );

  // A single lower-cased needle reused for both fields, so "tolkien" and
  // "the hobbit" cost one pass rather than two.
  const needle = query.trim().toLowerCase();
  const filtering = needle.length > 0 || genre !== "all";

  const visible = useMemo(() => {
    if (!books) return [];
    const matched = books.filter((b) => {
      if (genre !== "all" && b.genre !== genre) return false;
      if (!needle) return true;
      return b.title.toLowerCase().includes(needle) || b.author.toLowerCase().includes(needle);
    });
    // copy() — sort() mutates, and this must not reorder the cached list.
    return matched.sort(SORTS.find((s) => s.value === sort)?.compare ?? byTitle);
  }, [books, needle, genre, sort]);

  function clearFilters() {
    setQuery("");
    setGenre("all");
    setSort(DEFAULT_SORT);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Hero books={books} />

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex-1">
          <label
            htmlFor="catalogue-search"
            className="small-caps text-caption font-semibold text-ink-soft"
          >
            Search
          </label>
          <Input
            id="catalogue-search"
            type="search"
            className="mt-1.5"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or author…"
          />
        </div>

        {genres.length > 1 && (
          <div className="sm:w-52">
            <label
              htmlFor="catalogue-genre"
              className="small-caps text-caption font-semibold text-ink-soft"
            >
              Genre
            </label>
            <Select
              id="catalogue-genre"
              className="mt-1.5"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            >
              <option value="all">All genres</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="sm:w-52">
          <label
            htmlFor="catalogue-sort"
            className="small-caps text-caption font-semibold text-ink-soft"
          >
            Sort
          </label>
          <Select
            id="catalogue-sort"
            className="mt-1.5"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* The count doubles as proof the filters did something, so it only
          reports the narrowed total while one is active. */}
      {books && filtering && (
        <div className="mt-5 flex items-baseline justify-between gap-3 border-b border-stone pb-2">
          <p className="nums text-caption text-ink-soft">
            {filtering ? (
              <>
                <span className="font-semibold text-ink">{visible.length}</span> of{" "}
                {books.length} books
              </>
            ) : null}
          </p>
          {filtering && (
            <button
              onClick={clearFilters}
              className="small-caps text-caption font-semibold text-terracotta hover:opacity-80 focus:outline-none focus-visible:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="mt-6">
        {error && <ErrorNote error={error} className="mb-4" />}
        {!books && <Spinner />}
        {books && visible.length === 0 && (
          <EmptyState
            message={noResultsMessage(books.length, needle, genre)}
            // The catalogue isn't empty, so inviting another book would be
            // misleading — the reader simply has to widen the search.
            action={books.length === 0 ? <Button as="link" to="/books/new">Add a Book</Button> : null}
          />
        )}
        {visible.length > 0 && (
          <div className={GRID}>
            {visible.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Three distinct situations, not one: a bare catalogue, a genre with nothing
 * in it, and a search that found nothing. Only the first invites a new book.
 */
function noResultsMessage(total, needle, genre) {
  if (total === 0) return "The shelves are bare — add the first book to the catalogue.";
  if (needle && genre !== "all") {
    return `Nothing catalogued under ${genre} matches “${needle}”.`;
  }
  if (needle) return `No books match “${needle}”.`;
  return `Nothing catalogued under ${genre} yet.`;
}
