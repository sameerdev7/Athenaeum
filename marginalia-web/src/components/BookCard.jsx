import { useState } from "react";
import { Link } from "react-router-dom";
import { LaurelRating } from "./LaurelRating";
import { Avatar } from "./ui";
import { STATUS as STATUS_MAP } from "../utils/format";

// Cover-less books get a deterministic gradient jacket from their title.
export function coverGradient(title = "") {
  const hues = [14, 28, 160, 330, 38, 200];
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return `linear-gradient(150deg, hsl(${hues[h % hues.length]} 38% 30%), hsl(${hues[(h + 1) % hues.length]} 42% 17%))`;
}

/**
 * Poster frame, 2:3 to match a book cover. Open Library's images vary in
 * native aspect ratio, so `object-fit: cover` crops rather than distorting.
 * Fallback is a flat panel with the title set in Cinzel — never a
 * broken-image icon.
 */
export function Cover({ book, className = "" }) {
  const [failed, setFailed] = useState(false);
  const showImage = book.cover_url && !failed;

  return (
    <div
      className={`cover-sheen relative w-full overflow-hidden rounded-lg border border-stone bg-vellum-deep shadow-[0_14px_30px_-12px_rgba(0,0,0,0.55)] ${className}`}
      style={{ aspectRatio: "2 / 3" }}
    >
      {showImage ? (
        <img
          src={book.cover_url}
          alt={`Cover of ${book.title}`}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center p-3"
          style={{ backgroundImage: coverGradient(book.title) }}
        >
          <span className="text-center font-display text-sm font-bold leading-snug text-[#f2e8d0] drop-shadow">
            {book.title}
          </span>
        </div>
      )}
      {/* spine crease + gloss, so flat images read as bound books */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(0,0,0,0.28) 0, rgba(255,255,255,0.14) 3%, transparent 8%), linear-gradient(135deg, rgba(255,255,255,0.16), transparent 40%)",
        }}
      />
    </div>
  );
}

/**
 * Poster-oriented card. The Laurel row appears only when the card represents a
 * specific reader's relationship to the book, not the bare catalog entry.
 */
export function BookCard({ book, log = null, showAuthor = true }) {
  return (
    <Link
      to={`/books/${book.id}`}
      className="group reveal block focus:outline-none"
      aria-label={book.title}
    >
      <Cover
        book={book}
        className="transition-all duration-300 group-hover:-translate-y-2 group-hover:rotate-[-1.5deg] group-hover:shadow-[0_26px_44px_-12px_var(--g-b)] group-focus-visible:-translate-y-2"
      />
      <div className="mt-2 flex flex-col gap-0.5">
        <span className="truncate text-uitext font-bold text-ink group-hover:text-aurora">{book.title}</span>
        {showAuthor && (
          <span className="truncate text-caption italic text-ink-soft">{book.author}</span>
        )}
        {log?.rating != null && (
          <LaurelRating value={log.rating} size={12} className="mt-0.5" />
        )}
      </div>
    </Link>
  );
}

/**
 * Review Card / Log Card — feeds, a book's review list, a user's diary.
 * A scaled-down shape with no rating is reused for comments.
 */
export function LogCard({ log, children, to = null, featured = false, showCover = true }) {
  const { user, book } = log;
  const hasBody = log.review_text?.trim().length > 0;

  const Wrapper = to ? Link : "div";
  const wrapperProps = to ? { to } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className="tablet-edge reveal flex gap-4 rounded-2xl bg-vellum-deep p-4"
    >
      {/* A diary/feed row is a relationship to a specific book, so the cover
          is the anchor — a wall of avatars and quotes with no art was the
          "dull" complaint this fixes. Fixed-width thumbnail, not full poster
          size: this card is read top-to-bottom in a dense list, not browsed
          in a grid. Skippable via showCover: a book's own detail page already
          shows that cover once at the top, so repeating it on every log
          underneath is redundant, not helpful. */}
      {book && showCover && (
        <div className="w-14 shrink-0 sm:w-20">
          <Cover book={book} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <Avatar user={user} size={32} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-uitext font-semibold text-ink">
              {user?.username ?? "Unknown reader"}
            </span>
            {book && (
              <span className="truncate text-caption italic text-ink-soft">{book.title}</span>
            )}
          </div>
          <time
            dateTime={log.created_at}
            className="ml-auto shrink-0 text-caption text-ink-soft"
          >
            {new Date(log.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </div>

        {log.rating != null && <LaurelRating value={log.rating} size={14} className="mt-3" />}

        {hasBody && (
          <p className="truncate-lines-3 mt-2.5 text-uitext leading-relaxed text-ink">
            {log.review_text}
          </p>
        )}

        <StatusChip log={log} featured={featured} />

        {children}
      </div>
    </Wrapper>
  );
}

// A date-only field ("YYYY-MM-DD") has no time component, so parsing it with
// `new Date(isoString)` reads it as UTC midnight and can print a day early or
// late once toLocaleDateString applies the browser's own timezone. Building
// the Date from its y/m/d parts instead constructs it in local time, so the
// calendar date on screen always matches the date the server sent.
function formatDateOnly(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * A reader's own diary row: cover, title, and one date — whichever date
 * actually answers "when did this happen" for the entry's status. No avatar
 * or username, since the page this appears on (a profile) already says whose
 * diary it is; showing it again on every row was the "dull"/repetitive
 * complaint this replaces. Want-to-read/currently-reading entries have no
 * finished date yet, so they fall back to the same status chip LogCard uses.
 */
export function DiaryRow({ log, to = null }) {
  const { book } = log;
  const Wrapper = to ? Link : "div";
  const wrapperProps = to ? { to } : {};

  const dateLabel =
    log.status === "read" && log.finished_at
      ? `Finished ${formatDateOnly(log.finished_at)}`
      : log.status === "dnf" && log.finished_at
        ? `Dropped ${formatDateOnly(log.finished_at)}`
        : null;

  return (
    <Wrapper
      {...wrapperProps}
      className="tablet-edge flex items-center gap-3.5 rounded-2xl bg-vellum-deep p-3"
    >
      {book && (
        <div className="w-12 shrink-0">
          <Cover book={book} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <span className="block truncate text-uitext font-semibold text-ink">
          {book?.title ?? "Unknown book"}
        </span>
        {dateLabel ? (
          <span className="text-caption text-ink-soft">{dateLabel}</span>
        ) : (
          <StatusChip log={log} />
        )}
      </div>
    </Wrapper>
  );
}

/** A status chip only when it says something — "Read" is the default state. */
export function StatusChip({ log, featured = false }) {
  const status = STATUS_MAP[log.status];
  const showStatus = log.status !== "read" || log.is_reread;

  if (!showStatus && !featured) return null;

  const label = log.is_reread ? "Reread" : status?.label ?? log.status;
  const tone = log.is_reread ? "terracotta" : status?.tone ?? "neutral";

  const tones = {
    neutral: "bg-vellum-deep text-ink-soft border-stone",
    verdigris: "bg-verdigris-soft text-verdigris border-verdigris/30",
    terracotta: "bg-terracotta-soft text-terracotta border-terracotta/30",
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {showStatus && (
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-caption small-caps font-bold ${tones[tone]}`}
        >
          {label}
        </span>
      )}
      {/* --tyrian is the one accent reserved for "live now" or "featured" —
          never a status chip. */}
      {featured && (
        <span className="bg-aurora inline-flex items-center rounded-full px-2.5 py-0.5 text-caption small-caps font-bold text-on-accent shadow-[0_0_18px_-4px_var(--tyrian)]">
          Featured
        </span>
      )}
    </div>
  );
}
