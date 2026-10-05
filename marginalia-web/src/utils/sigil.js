/**
 * Placeholder avatars — "sigils".
 *
 * A reader with no photograph gets a wax-seal medallion instead: a filled
 * circle in the app's own palette with their initial in Cinzel, the same
 * language as WaxSeal in components/Motifs.jsx. The pick is stored in
 * avatar_url as a self-contained SVG data URI, so the same mark renders in
 * the feed, on the profile, in the Scriptorium and in the Agora without any
 * external avatar service and without shipping an image file.
 *
 * The colour is read from the live CSS custom property at pick time, so these
 * can never drift away from the palette defined in index.css.
 */

const MARKER = "marginalia-sigil-";

/** The eight marks, in the order they are offered. */
export const SIGILS = [
  { key: "terracotta", fill: "--terracotta", text: "--parchment", name: "Terracotta" },
  { key: "terracotta-soft", fill: "--terracotta-soft", text: "--soot-ink", name: "Faded terracotta" },
  { key: "verdigris", fill: "--verdigris", text: "--parchment", name: "Verdigris" },
  { key: "verdigris-soft", fill: "--verdigris-soft", text: "--soot-ink", name: "Pale verdigris" },
  { key: "ochre", fill: "--ochre", text: "--soot-ink", name: "Ochre" },
  { key: "tyrian", fill: "--tyrian", text: "--parchment", name: "Tyrian" },
  { key: "soot-ink", fill: "--soot-ink", text: "--parchment", name: "Ink" },
  { key: "stone-line", fill: "--stone-line", text: "--soot-ink", name: "Stone" },
];

/** The reader's own initial, for a wax seal. */
export function initialOf(name) {
  return (name || "").trim().charAt(0).toUpperCase() || "?";
}

/** Resolve a palette custom property to a colour the SVG can use. */
export function resolveToken(token, fallback = "#b5502e") {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  return value || fallback;
}

/**
 * Build the data URI for a sigil. `key` is written into the SVG as a comment
 * so a chosen sigil can be recognised later and re-lettered if the reader
 * renames themselves.
 */
export function sigilDataUri(letter, sigil) {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">`,
    `<!--${MARKER}${sigil.key}-->`,
    `<circle cx="48" cy="48" r="48" fill="${resolveToken(sigil.fill)}"/>`,
    `<text x="48" y="49" text-anchor="middle" dominant-baseline="central"`,
    ` font-family="Cinzel, Georgia, serif" font-weight="600" font-size="44"`,
    ` fill="${resolveToken(sigil.text, "#f1e9d8")}">${letter}</text>`,
    `</svg>`,
  ].join("");
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** The sigil key behind an avatar_url, or null if it is a real image. */
export function sigilKeyOf(avatarUrl) {
  if (!avatarUrl?.includes(MARKER)) return null;
  // The marker sits in an SVG comment, so the key is terminated by the
  // comment's own "--" closing. Anchoring on that keeps a trailing hyphen out
  // of the key (a greedy [a-z-]+ would read "terracotta-soft--" instead).
  return avatarUrl.match(/marginalia-sigil-([a-z-]*[a-z])--/)?.[1] ?? null;
}

export function sigilByKey(key) {
  return SIGILS.find((s) => s.key === key) ?? null;
}

/**
 * Re-letter a chosen sigil when the reader's name changes, so the mark keeps
 * showing their current initial. A real photo URL is returned untouched.
 */
export function refreshSigil(avatarUrl, username) {
  const key = sigilKeyOf(avatarUrl);
  const sigil = sigilByKey(key);
  if (!sigil) return avatarUrl;
  return sigilDataUri(initialOf(username), sigil);
}
