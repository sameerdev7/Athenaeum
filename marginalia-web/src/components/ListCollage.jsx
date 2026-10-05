import { useState } from "react";

/**
 * A list, told by its books: an overlapping fan of covers, leftmost on top —
 * the way Letterboxd does it. Every cover keeps its true 2:3 shape (the old
 * 2x2 tile cropped covers into 4:3 cells, which is what made them look zoomed
 * and soft). Spacing is computed so five covers fill the strip exactly; fewer
 * covers sit with a gentler overlap. On hover the fan opens a little, staying inside its box.
 */
const SLOTS = 5;
const OVERLAP = 0.45; // resting: each cover is shifted by 45% of its own width
const OPEN = 0.06; // hover: each cover slides a further 6% of its width per position

export function ListCollage({ list, books = [], max = SLOTS, className = "" }) {
  const shown = books.filter(Boolean).slice(0, Math.min(max, SLOTS));
  // Strip geometry in cover-widths. The strip is sized for the *opened* fan
  // (OVERLAP + OPEN per step), so the hover animation always stays inside it.
  const total = 1 + (OVERLAP + OPEN) * (SLOTS - 1);
  const coverW = 100 / total; // % of the strip width
  const step =
    shown.length > 1
      ? Math.min(coverW * 0.9, (100 - coverW) / (shown.length - 1) - OPEN * coverW)
      : 0;

  return (
    <div
      data-list-collage=""
      className={`group/collage relative w-full ${className}`}
      // Strip height = one cover's height (2:3 of its width).
      style={{ aspectRatio: `${total} / 1.5` }}
    >
      {shown.length === 0 ? (
        <div className="absolute inset-0 grid place-items-center rounded-lg border border-dashed border-stone p-3">
          <span className="text-center font-display text-sm text-ink-soft">{list.title}</span>
        </div>
      ) : (
        shown.map((book, i) => (
          <Tile
            key={book.id}
            book={book}
            style={{
              left: `${i * step}%`,
              width: `${coverW}%`,
              zIndex: shown.length - i,
              "--i": i,
            }}
          />
        ))
      )}
    </div>
  );
}

/** One cover at 2:3, falling back to its title on a gradient jacket. */
function Tile({ book, style }) {
  const [failed, setFailed] = useState(false);
  const showImage = book.cover_url && !failed;

  return (
    <div
      className="absolute top-0 h-full overflow-hidden rounded-[5px] bg-vellum-deep shadow-[3px_0_10px_-2px_rgba(0,0,0,0.55)] ring-1 ring-white/20 transition-transform duration-500 ease-out group-hover/collage:[transform:translateX(calc(var(--i)*6%))]"
      style={style}
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
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-terracotta/40 to-tyrian/50 p-2">
          <span className="text-center font-display text-[0.65rem] font-bold leading-tight text-[#f2e8d0]">
            {book.title}
          </span>
        </div>
      )}
    </div>
  );
}
