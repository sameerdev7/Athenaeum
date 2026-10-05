// Relative timestamps in tabular numerals — Spectral handles numerals, so
// no separate mono face (see docs/DESIGN.md § Typography).
export function relativeTime(value) {
  if (!value) return "";
  const then = new Date(value);
  const seconds = Math.round((Date.now() - then.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return then.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function fullDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export const STATUS = {
  want_to_read: { label: "Want to Read", tone: "terracotta" },
  reading: { label: "Currently Reading", tone: "verdigris" },
  read: { label: "Read", tone: "neutral" },
  dnf: { label: "Did Not Finish", tone: "terracotta" },
};

export const STATUS_OPTIONS = [
  { value: "want_to_read", label: "Want to Read" },
  { value: "reading", label: "Currently Reading" },
  { value: "read", label: "Read" },
  { value: "dnf", label: "Did Not Finish" },
];

export function pluralize(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
