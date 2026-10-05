import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listJournal, myJournal } from "../api/journal";
import { useAuth } from "../context/AuthContext";
import PageHeader from "../components/PageHeader";
import { coverGradient } from "../components/BookCard";
import { Avatar, Badge, Button, EmptyState, ErrorNote, Spinner } from "../components/ui";
import { fullDate } from "../utils/format";

const PAGE = 12;

/**
 * Art for an entry. Book covers are portrait, so cropping one into a wide
 * banner (object-cover) zooms and blurs it. Like Letterboxd's, this keeps the
 * cover at its true 2:3 shape, sharp and centred, over a soft blurred wash of
 * its own colours. Only an author-supplied cover image is allowed to fill the
 * frame, since that is chosen to be wide.
 */
export function EntryArt({ entry, className = "" }) {
  const [own, setOwn] = useState(true);
  const [bookOk, setBookOk] = useState(true);
  const bookCover = entry.book?.cover_url;

  if (entry.cover_url && own) {
    return (
      <div className={`relative overflow-hidden bg-vellum-deep ${className}`}>
        <img
          src={entry.cover_url}
          alt=""
          loading="lazy"
          onError={() => setOwn(false)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      </div>
    );
  }

  if (bookCover && bookOk) {
    return (
      <div className={`relative isolate overflow-hidden bg-vellum-deep ${className}`}>
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 scale-150 opacity-60 blur-2xl saturate-150"
          style={{ backgroundImage: `url(${bookCover})`, backgroundSize: "cover", backgroundPosition: "center" }}
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black/35 to-transparent" />
        {/* Absolutely placed, so the cover never dictates the card's height. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={bookCover}
            alt=""
            loading="lazy"
            onError={() => setBookOk(false)}
            className="aspect-[2/3] h-[84%] w-auto rounded-[5px] object-cover shadow-[0_14px_30px_-8px_rgba(0,0,0,0.7)] ring-1 ring-white/20 transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-[1.03]"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundImage: coverGradient(entry.title) }}
    >
      <span className="absolute inset-0 grid place-items-center font-display text-6xl font-bold text-[#f2e8d0]/70">
        {entry.title.charAt(0)}
      </span>
    </div>
  );
}

function Byline({ entry }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 whitespace-nowrap text-caption text-ink-soft">
      <Avatar user={entry.author} size={24} ring={1} />
      <span className="font-semibold text-ink">{entry.author.username}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={entry.published_at ?? entry.created_at}>
        {fullDate(entry.published_at ?? entry.created_at)}
      </time>
      <span aria-hidden="true">·</span>
      <span>{entry.reading_minutes} min read</span>
    </div>
  );
}

export function EntryCard({ entry, featured = false, editDraft = false }) {
  const to = editDraft && !entry.published ? `/journal/${entry.id}/edit` : `/journal/${entry.id}`;
  return (
    <Link
      to={to}
      className={`tablet-edge reveal group flex overflow-hidden rounded-2xl bg-vellum-deep ${
        featured ? "flex-col md:col-span-3 md:flex-row" : "flex-col"
      }`}
    >
      <EntryArt
        entry={entry}
        className={featured ? "aspect-[16/10] md:aspect-auto md:min-h-[22rem] md:w-1/2" : "aspect-[16/10]"}
      />
      <div className={`flex flex-1 flex-col gap-3 p-5 ${featured ? "md:justify-center md:p-10" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          {!entry.published && <Badge tone="terracotta">Draft</Badge>}
          {entry.book && (
            <span className="small-caps truncate text-caption font-bold text-ochre">
              On {entry.book.title}
            </span>
          )}
        </div>
        <h2
          className={`font-display font-bold leading-tight text-ink group-hover:text-aurora ${
            featured ? "text-section md:text-[2.3rem]" : "text-cardtitle"
          }`}
        >
          {entry.title}
        </h2>
        <p className={`text-ink-soft ${featured ? "text-body" : "text-uitext"} line-clamp-3`}>
          {entry.excerpt}
        </p>
        <div className="mt-auto pt-1">
          <Byline entry={entry} />
        </div>
      </div>
    </Link>
  );
}

/**
 * The Journal — long-form writing. "All" is the public, published feed;
 * "My writing" adds the signed-in reader's drafts.
 */
export default function Journal() {
  const { token } = useAuth();
  const [tab, setTab] = useState("all");
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    document.title = "Journal • Athenaeum";
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Reset-then-load is the point of keying this effect on the tab.
    setEntries(null);
    setError("");
    const req = tab === "mine" ? myJournal() : listJournal({ limit: PAGE });
    req
      .then((data) => {
        if (cancelled) return;
        setEntries(data);
        setHasMore(tab === "all" && data.length === PAGE);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [tab]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await listJournal({ limit: PAGE, offset: entries.length });
      setEntries((prev) => [...prev, ...next]);
      setHasMore(next.length === PAGE);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  const [first, ...rest] = entries ?? [];
  const featured = tab === "all" && first;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="The Journal"
          subtitle="Essays, analyses and notes from the reading room — long-form thinking about books."
        />
        {token ? (
          <Button as="link" to="/journal/new">
            Write an entry
          </Button>
        ) : (
          <Button as="link" to="/login" variant="secondary">
            Sign in to write
          </Button>
        )}
      </div>

      {token && (
        <div className="mt-7 flex gap-2" role="tablist">
          {[
            ["all", "All writing"],
            ["mine", "My writing"],
          ].map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`small-caps rounded-full border px-4 py-1.5 text-caption font-bold ${
                tab === value
                  ? "btn-aurora"
                  : "border-stone bg-vellum-deep text-ink-soft hover:border-tyrian hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <ErrorNote error={error} className="mt-6" />
      {!entries && !error && <Spinner />}

      {entries?.length === 0 && (
        <EmptyState
          message={
            tab === "mine"
              ? "You haven't written anything yet — the first page is still blank."
              : "The journal is quiet. Be the first to write."
          }
          action={token ? <Button as="link" to="/journal/new">Write an entry</Button> : null}
        />
      )}

      {entries?.length > 0 && (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {featured && <EntryCard entry={first} featured />}
          {(featured ? rest : entries).map((e) => (
            <EntryCard key={e.id} entry={e} editDraft={tab === "mine"} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-8 text-center">
          <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

export { Byline };
