import { useState } from "react";

import { Link } from "react-router-dom";
import { Amphora } from "./Motifs";
import { BASE_URL } from "../api/client";

/** Primary: animated aurora gradient pill. Secondary: glass. Ghost: text. */
const VARIANTS = {
  primary: "btn-aurora",
  secondary:
    "bg-vellum-deep text-ink border border-stone backdrop-blur hover:border-verdigris hover:text-verdigris hover:shadow-[0_0_24px_-6px_var(--verdigris)]",
  destructive:
    "bg-transparent text-error border border-error/50 hover:bg-error/10 hover:border-error",
  ghost:
    "bg-transparent text-ink-soft border border-transparent hover:text-ink hover:bg-vellum-deep",
};

const SIZES = {
  sm: "px-3.5 py-1.5 text-caption",
  md: "px-5 py-2.5 text-uitext",
};

export function Button({
  variant = "primary",
  size = "md",
  as,
  className = "",
  children,
  ...props
}) {
  const classes = `inline-flex items-center justify-center gap-2 rounded-full small-caps font-bold disabled:opacity-45 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
  if (as === "link") {
    return (
      <Link className={classes} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, id }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-caption small-caps font-semibold text-ink-soft"
      >
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-caption text-ink-soft">{hint}</p>}
      {error && <p className="text-caption text-error">{error}</p>}
    </div>
  );
}

const CONTROL =
  "w-full bg-[var(--control-bg)] border border-stone rounded-lg px-4 py-2.5 text-uitext text-ink placeholder:text-ink-soft/60 backdrop-blur focus:border-tyrian focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--tyrian)_25%,transparent)] focus:outline-none";

export function Input({ className = "", ...props }) {
  return <input className={`${CONTROL} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }) {
  return <textarea className={`${CONTROL} leading-relaxed ${className}`} {...props} />;
}

export function Select({ className = "", children, ...props }) {
  return (
    <select className={`${CONTROL} ${className}`} {...props}>
      {children}
    </select>
  );
}

/**
 * Avatar: the image when it loads, otherwise an initial-letter medallion.
 * A URL that 404s or is blocked falls back the same way a null one does —
 * `avatar_url` is free text, so a bad link is a normal state.
 */
// A soft gradient halo rather than a hard border: the ring is a box-shadow so
// it never changes the image's box size.
function ringStyle(ring) {
  return {
    boxShadow: `0 0 0 ${Math.max(1, ring - 1)}px var(--parchment), 0 0 0 ${ring + 1}px var(--g-b), 0 6px 18px -4px color-mix(in oklab, var(--g-b) 60%, transparent)`,
  };
}

export function Avatar({ user, size = 32, ring = 2, className = "" }) {
  const [failed, setFailed] = useState(false);
  const initial = (user?.username || "?").trim().charAt(0).toUpperCase();

  // Uploaded pictures are stored as "/api/uploads/…"; with a separate API
  // origin they must be fetched from there, not from the frontend host.
  const src = user?.avatar_url?.startsWith("/")
    ? `${BASE_URL}${user.avatar_url}`
    : user?.avatar_url;

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={user.username}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size, ...ringStyle(ring) }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-aurora font-display font-bold text-on-accent ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.44, ...ringStyle(ring) }}
    >
      {initial}
    </span>
  );
}

/** Card surface: the 1px + inset-1px double rule that reads as a carved tablet. */
export function Card({ as: As = "div", className = "", children, ...props }) {
  return (
    <As className={`tablet-edge bg-vellum-deep rounded-2xl ${className}`} {...props}>
      {children}
    </As>
  );
}

export function Badge({ children, tone = "neutral", className = "" }) {
  const tones = {
    neutral: "bg-vellum-deep text-ink-soft border-stone",
    verdigris: "bg-verdigris-soft text-verdigris border-verdigris/30",
    terracotta: "bg-terracotta-soft text-terracotta border-terracotta/30",
    // --tyrian is reserved for "live now" / featured. Never a status chip.
    tyrian: "bg-aurora text-on-accent border-transparent shadow-[0_0_18px_-4px_var(--tyrian)]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-caption small-caps font-bold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Empty state: amphora line-art + one line of Spectral italic. Same everywhere. */
export function EmptyState({ message, action, className = "" }) {
  return (
    <div
      className={`flex flex-col items-center gap-4 px-6 py-16 text-center ${className}`}
    >
      <Amphora />
      <p className="max-w-sm text-uitext italic text-ink-soft">{message}</p>
      {action}
    </div>
  );
}

export function Spinner({ className = "" }) {
  return (
    <div className={`flex justify-center py-16 ${className}`}>
      <div
        className="h-7 w-7 animate-spin rounded-full border-[3px] border-stone border-t-tyrian border-r-terracotta shadow-[0_0_20px_-4px_var(--tyrian)]"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}

export function ErrorNote({ error, className = "" }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className={`rounded-xl border border-error/50 bg-error/10 px-4 py-2.5 text-uitext text-error ${className}`}
    >
      {error}
    </p>
  );
}
