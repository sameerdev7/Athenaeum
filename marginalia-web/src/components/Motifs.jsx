// The custom marks from docs/DESIGN.md § Iconography. All line-art,
// single-weight, single-color, inheriting currentColor.

/**
 * Section rule — a gilded Greek-key frieze.
 * (Still called Meander so every page that draws one picks up the new look.)
 */
export function Meander({ className = "" }) {
  return <div aria-hidden="true" className={`meander w-full ${className}`} />;
}

/** Five gilded flutes — the divider between major page sections. */
export function ColumnFlute({ className = "" }) {
  return (
    <div aria-hidden="true" className={`flex items-center justify-center gap-2 ${className}`}>
      {[14, 24, 34, 24, 14].map((h, i) => (
        <span
          key={i}
          className="block w-0.5 rounded-full"
          style={{ height: h, background: "linear-gradient(var(--g-c), var(--g-a))", boxShadow: "0 0 10px color-mix(in oklab, var(--g-b) 60%, transparent)" }}
        />
      ))}
    </div>
  );
}

/**
 * Wax seal — a small circular stamp motif for "owner" and "you started this"
 * badges. Filled --terracotta with a carved initial inside; the circular
 * stamp shape, not literal wax texture.
 */
export function WaxSeal({ initial = "", title, size = 22 }) {
  return (
    <span
      title={title}
      className="btn-aurora inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-on-accent"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      aria-label={title}
    >
      {initial}
    </span>
  );
}

/** Oil lamp — the "live" indicator. Always paired with --tyrian when lit. */
export function OilLamp({ lit = true, size = 14, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`shrink-0 ${lit ? "text-tyrian" : "text-stone"} ${className}`}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* flame */}
        <path d="M12 3.5 C 14 6 14.5 7.5 14.5 9.2 C 14.5 10.8 13.4 12 12 12 C 10.6 12 9.5 10.8 9.5 9.2 C 9.5 7.5 10 6 12 3.5 Z" />
        {/* reservoir + spout */}
        <path d="M7 16 C 7 14 9 13 12 13 C 15 13 17 14 17 16 C 17 18.5 14.7 20 12 20 C 9.3 20 7 18.5 7 16 Z" />
        <path d="M17 15.2 L 20.5 13.5" />
        <path d="M9 20 L 8 21.5" />
        <path d="M15 20 L 16 21.5" />
      </g>
    </svg>
  );
}

/** Empty-state illustration: a levitating open book trailing sparks. */
export function Amphora({ size = 72, className = "" }) {
  return (
    <svg
      width={size * 1.5}
      height={size * 1.2}
      viewBox="0 0 90 72"
      aria-hidden="true"
      className={`float-y overflow-visible ${className}`}
      style={{ filter: "drop-shadow(0 8px 22px color-mix(in oklab, var(--g-b) 60%, transparent))" }}
    >
      <defs>
        <linearGradient id="empty-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--g-a)" />
          <stop offset="0.6" stopColor="var(--g-b)" />
          <stop offset="1" stopColor="var(--g-c)" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#empty-g)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M45 24 C 36 17 22 17 10 21 V 55 C 22 51 36 51 45 58 C 54 51 68 51 80 55 V 21 C 68 17 54 17 45 24 Z" fill="url(#empty-g)" fillOpacity="0.14" />
        <path d="M45 24 V 58" />
        <path d="M18 28 C 26 26 33 27 38 30" opacity="0.7" />
        <path d="M18 36 C 26 34 33 35 38 38" opacity="0.7" />
        <path d="M72 28 C 64 26 57 27 52 30" opacity="0.7" />
        <path d="M72 36 C 64 34 57 35 52 38" opacity="0.7" />
      </g>
      <g fill="var(--g-e)">
        <path d="M45 3 l1.8 4.6 4.6 1.8 -4.6 1.8 -1.8 4.6 -1.8 -4.6 -4.6 -1.8 4.6 -1.8z" />
        <circle cx="72" cy="8" r="2" fill="var(--g-d)" />
        <circle cx="19" cy="10" r="1.6" fill="var(--g-a)" />
      </g>
    </svg>
  );
}

export default Meander;
