import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteEntry, getEntry, listJournal } from "../api/journal";
import { useMe } from "../hooks/useMe";
import Markdown from "../components/Markdown";
import { Cover } from "../components/BookCard";
import { Avatar, Badge, Button, ErrorNote, Spinner } from "../components/ui";
import { Meander } from "../components/Motifs";
import { fullDate } from "../utils/format";
import { EntryArt } from "./Journal";

/** A thin gold bar across the top that fills as you read. */
function ReadingProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="fixed inset-x-0 top-0 z-40 h-[3px]" aria-hidden="true">
      <div className="bg-aurora h-full shadow-[0_0_12px_var(--g-b)]" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function JournalEntry() {
  const { entryId } = useParams();
  const navigate = useNavigate();
  const { me } = useMe();
  const [entry, setEntry] = useState(null);
  const [more, setMore] = useState([]);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEntry(null);
    setError("");
    window.scrollTo(0, 0);
    getEntry(entryId)
      .then((e) => {
        if (cancelled) return;
        setEntry(e);
        document.title = `${e.title} • Athenaeum Journal`;
        if (e.published) {
          listJournal({ limit: 4 })
            .then((rows) => !cancelled && setMore(rows.filter((r) => r.id !== e.id).slice(0, 3)))
            .catch(() => {});
        }
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  async function onDelete() {
    try {
      await deleteEntry(entry.id);
      navigate("/journal");
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <ErrorNote error={error} />
        <Link to="/journal" className="small-caps mt-6 inline-block text-uitext font-bold text-terracotta">
          Back to the Journal
        </Link>
      </div>
    );
  }
  if (!entry) return <Spinner />;

  const isOwner = me?.id === entry.author.id;
  const date = entry.published_at ?? entry.created_at;

  return (
    <article>
      <ReadingProgress />

      <header className="mx-auto max-w-3xl px-4 pb-8 pt-10 text-center rise-in">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {!entry.published && <Badge tone="terracotta">Draft — only you can see this</Badge>}
          <Link to="/journal" className="small-caps text-caption font-bold text-ochre hover:opacity-80">
            The Journal
          </Link>
        </div>
        <h1 className="text-aurora mt-4 pb-2 text-[clamp(2rem,5.5vw,3.6rem)] font-bold leading-[1.1]">
          {entry.title}
        </h1>
        {entry.subtitle && (
          <p className="mx-auto mt-3 max-w-2xl text-cardtitle italic text-ink-soft">{entry.subtitle}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-uitext text-ink-soft">
          <Link to={`/users/${entry.author.id}`} className="flex items-center gap-2 hover:text-ink">
            <Avatar user={entry.author} size={30} ring={1} />
            <span className="font-semibold text-ink">{entry.author.username}</span>
          </Link>
          <span aria-hidden="true">·</span>
          <time dateTime={date}>{fullDate(date)}</time>
          <span aria-hidden="true">·</span>
          <span>{entry.reading_minutes} min read</span>
        </div>

        {isOwner && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button as="link" to={`/journal/${entry.id}/edit`} variant="secondary" size="sm">
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          </div>
        )}
        {confirming && (
          <div className="tablet-edge-solid mx-auto mt-4 max-w-md rounded-2xl bg-vellum-deep p-4 backdrop-blur">
            <p className="text-uitext">Delete this entry for good?</p>
            <div className="mt-3 flex justify-center gap-2">
              <Button variant="destructive" size="sm" onClick={onDelete}>
                Yes, delete it
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* A banner only for a real cover image — a portrait book cover cropped to a
          wide strip looks worse than none; the linked book gets its own card below. */}
      {entry.cover_url && (
        <div className="mx-auto max-w-5xl px-4">
          <EntryArt entry={entry} className="aspect-[21/9] rounded-2xl shadow-[var(--card-shadow)]" />
        </div>
      )}

      <div className="mx-auto max-w-[42rem] px-4 py-12">
        <Markdown source={entry.body} />

        <div className="mt-14">
          <Meander />
        </div>

        {entry.book && (
          <Link
            to={`/books/${entry.book.id}`}
            className="tablet-edge mt-8 flex items-center gap-4 rounded-2xl bg-vellum-deep p-4"
          >
            <div className="w-14 shrink-0">
              <Cover book={entry.book} />
            </div>
            <div className="min-w-0">
              <p className="small-caps text-caption font-bold text-ochre">This essay is about</p>
              <p className="truncate font-display text-cardtitle font-bold text-ink">{entry.book.title}</p>
              <p className="truncate text-caption italic text-ink-soft">{entry.book.author}</p>
            </div>
          </Link>
        )}
      </div>

      {more.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-8">
          <h2 className="font-display text-section text-ink">More from the Journal</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {more.map((m) => (
              <Link
                key={m.id}
                to={`/journal/${m.id}`}
                className="tablet-edge group flex flex-col overflow-hidden rounded-2xl bg-vellum-deep"
              >
                <EntryArt entry={m} className="aspect-[16/9]" />
                <div className="p-4">
                  <h3 className="font-display text-uitext font-bold leading-snug text-ink group-hover:text-aurora">
                    {m.title}
                  </h3>
                  <p className="mt-1 text-caption text-ink-soft">
                    {m.author.username} · {m.reading_minutes} min
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
