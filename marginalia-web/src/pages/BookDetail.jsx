import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteBook, getBook, getSimilarBooks } from "../api/books";
import { invalidateCatalog } from "../api/catalog";
import { getLogs } from "../api/logs";
import { hydrateLogs } from "../api/catalog";
import { useAuth } from "../context/AuthContext";
import { Cover, BookCard, LogCard } from "../components/BookCard";
import { Meander } from "../components/Motifs";
import {
  Button,
  ErrorNote,
  Spinner,
} from "../components/ui";
import { useMe } from "../hooks/useMe";
import { pluralize } from "../utils/format";

/**
 * A single book's catalogue entry: cover + metadata, then three sections that
 * each only appear when they have something to show — "Popular Reviews",
 * the Reading Logs list, and a "Similar Books" rail at the foot of the page.
 * An unlogged, unreviewed book still gets Similar Books, so the page is
 * never just a header with nothing under it. Four independent fetches, not
 * one combined call — popular and similar are each the server's own ranking
 * over a different question, not client-side slices of the log list (see
 * the comments on those two fetches below).
 */
export default function BookDetail() {
  const { bookId } = useParams();
  const { token } = useAuth();
  const { me } = useMe();
  const navigate = useNavigate();

  const [book, setBook] = useState(null);
  const [logs, setLogs] = useState(null);
  const [popular, setPopular] = useState(null);
  const [similar, setSimilar] = useState(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    // Set while the book is still in flight, then replaced with the book's own
    // title once it arrives, so the tab matches every other page's pattern.
    document.title = "Athenaeum";
    let cancelled = false;

    setBook(null);
    setLogs(null);
    setPopular(null);
    setSimilar(null);
    setError("");

    // The popular section is the old /popular page, scoped to this book: the
    // same endpoint and ordering, narrowed by book_id. It is fetched apart from
    // the full log list because "popular" is the server's ranking, not a
    // client-side slice of it.
    getLogs({ book_id: bookId, has_review: true, sort: "popular", limit: 20 })
      .then(hydrateLogs)
      .then((l) => !cancelled && setPopular(l))
      .catch(() => {
        // A missing popular list is not worth an error note on the page.
      });

    // Content-based recommendations from the recommender, fetched apart from
    // the book and its logs for the same reason: this rail is optional colour
    // at the bottom of the page, and it must not be able to block or error the
    // rest of the page. A book with nothing textually close to it comes back
    // as [] and the section simply doesn't render.
    getSimilarBooks(bookId)
      .then((s) => !cancelled && setSimilar(s))
      .catch(() => {
        // Same call: a recommender outage is not the reader's problem.
      });

    Promise.all([getBook(bookId), getLogs({ book_id: bookId, limit: 50 })])
      .then(async ([b, l]) => {
        // Hydrate before setting state: committing `book` and `logs` in two
        // steps would render an intermediate frame where one is still null.
        const hydrated = await hydrateLogs(l);
        if (cancelled) return;
        setBook(b);
        setLogs(hydrated);
        document.title = `${b.title} • Athenaeum`;
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  async function onDelete() {
    try {
      await deleteBook(book.id);
      invalidateCatalog();
      navigate("/discover");
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <ErrorNote error={error} />
        <Link
          to="/discover"
          className="small-caps mt-6 inline-block text-uitext font-semibold text-terracotta"
        >
          Back to Discover
        </Link>
      </div>
    );
  }

  if (!book) return <Spinner />;

  const isOwner = Boolean(me && book.owner && me.id === book.owner.id);
  const reviewCount = (logs ?? []).filter((l) => l.review_text?.trim()).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Cover header: poster left, metadata right. Cinzel for the book title
          on its own detail page — the one place it appears at 3.5rem. */}
      <div className="tablet-edge relative flex flex-col gap-8 overflow-hidden rounded-[18px] p-6 sm:flex-row sm:p-10">
        {book.cover_url && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 scale-125 opacity-40 blur-3xl saturate-150"
            style={{ backgroundImage: `url(${book.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" }}
          />
        )}
        <div className="w-48 shrink-0 self-center sm:w-64 sm:self-start [perspective:900px]">
          <div className="transition-transform duration-500 hover:[transform:rotateY(-10deg)_rotateX(3deg)] shadow-[0_40px_60px_-20px_rgba(0,0,0,0.7)] rounded-lg">
            <Cover book={book} />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="font-display font-bold leading-[1.02] text-booktitle text-ink">
            {book.title}
          </h1>
          <p className="text-aurora mt-3 inline-block font-body text-cardtitle font-medium italic">
            {book.author}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-caption text-ink-soft">
            <span className="nums rounded-full border border-stone bg-vellum-deep px-3 py-1">{book.year}</span>
            <span className="nums rounded-full border border-stone bg-vellum-deep px-3 py-1">{pluralize(book.pages, "page")}</span>
            <span className="rounded-full bg-aurora px-3 py-1 font-bold text-on-accent">{book.genre}</span>
          </div>

          <p className="mt-5 max-w-prose text-body leading-relaxed text-ink">
            {book.description}
          </p>

          <p className="mt-4 text-caption text-ink-soft">
            Catalogued by{" "}
            <Link
              to={`/users/${book.owner?.id}`}
              className="italic text-terracotta hover:opacity-80"
            >
              {book.owner?.username ?? "unknown"}
            </Link>
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {token ? (
              <Button as="link" to={`/books/${book.id}/log`}>
                Log this Book
              </Button>
            ) : (
              <Button as="link" to="/login" variant="secondary">
                Sign in to log this book
              </Button>
            )}
            {isOwner && (
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                Remove from Catalogue
              </Button>
            )}
          </div>

          {confirmDelete && isOwner && (
            <div className="tablet-edge-solid mt-4 rounded-2xl bg-vellum-deep p-4 backdrop-blur">
              <p className="text-uitext text-ink">
                Remove this entry from the catalogue? Its reading logs and list
                placements go with it.
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="destructive" onClick={onDelete}>
                  Yes, remove it
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {popular?.length > 0 && (
        <section className="mt-12" data-popular-reviews="">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-section text-ink">
              Popular Reviews
            </h2>
            <p className="nums text-caption text-ink-soft">
              {pluralize(popular.length, "review")}
            </p>
          </div>
          <p className="mt-1.5 max-w-prose text-uitext italic text-ink-soft">
            What other readers found worth saying out loud.
          </p>
          <div className="mt-3">
            <Meander />
          </div>

          {/* showCover={false} on both LogCard lists below: this page's own
              header already shows the cover once, so repeating it on every
              log underneath it is redundant, not helpful. */}
          <div className="mx-auto mt-6 flex max-w-[640px] flex-col gap-4">
            {popular.map((log, i) => (
              // --tyrian means "live now" or "featured", so it marks the top
              // three of this book and nothing else.
              <LogCard
                key={log.id}
                log={log}
                to={`/logs/${log.id}`}
                featured={i < 3}
                showCover={false}
              />
            ))}
          </div>
        </section>
      )}

      {/* Same treatment as Popular Reviews above: a book with nobody's logged
          it yet has nothing to show here, so the heading and empty state
          both go away rather than sitting on the page as clutter — the "Log
          this Book" button above already covers that call to action. */}
      {logs?.length > 0 && (
        <div className="mt-12">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-section text-ink">Reading Logs</h2>
            <p className="nums text-caption text-ink-soft">
              {pluralize(logs.length, "entry", "entries")} ·{" "}
              {pluralize(reviewCount, "review")}
            </p>
          </div>
          <div className="mt-3">
            <Meander />
          </div>

          <div className="mx-auto mt-6 flex max-w-[640px] flex-col gap-4">
            {logs.map((log) => (
              <LogCard key={log.id} log={log} to={`/logs/${log.id}`} showCover={false} />
            ))}
          </div>
        </div>
      )}

      {/* "More like this" goes at the foot of the page, as Letterboxd puts
          similar films at the foot of a film. A rail rather than a second
          catalogue grid: these are suggestions, not the main event. Each
          column is fixed-width so the row scrolls sideways instead of the
          cards stretching. */}
      {similar?.length > 0 && (
        <section className="mt-12" data-similar-books="">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-section text-ink">Similar Books</h2>
            <p className="nums text-caption text-ink-soft">
              {pluralize(similar.length, "book")}
            </p>
          </div>
          <div className="mt-3">
            <Meander />
          </div>

          <div className="mt-6 flex gap-4 overflow-x-auto pb-2">
            {similar.map((rec) => (
              <div key={rec.id} className="w-36 shrink-0">
                <BookCard book={rec} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
