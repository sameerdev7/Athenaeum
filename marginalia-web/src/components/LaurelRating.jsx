import { useId } from "react";

// A single laurel sprig: a central stem with paired almond leaves, drawn
// line-art at one weight. Filled = --ochre, outline = --stone-line.
// Half value splits the fill down the leaf's spine, the way half-stars work.
function Sprig({ state, size }) {
  const clipId = useId();

  // Three paired almond leaves up the stem, each pointing outward and up.
  const leaves = [
    "M12 18.5 C 15 17.5 18 15.5 20.5 12 C 16.5 13 13.5 15 12 18.5 Z",
    "M12 18.5 C 9 17.5 6 15.5 3.5 12 C 7.5 13 10.5 15 12 18.5 Z",
    "M12 13 C 15 12 18 10 20 6.5 C 16 7.5 13.5 9.5 12 13 Z",
    "M12 13 C 9 12 6 10 4 6.5 C 8 7.5 10.5 9.5 12 13 Z",
    "M12 7.5 C 14.5 6.5 17 4.5 18.5 1.5 C 15 2.5 13 4.5 12 7.5 Z",
    "M12 7.5 C 9.5 6.5 7 4.5 5.5 1.5 C 9 2.5 11 4.5 12 7.5 Z",
  ];

  const outline = (
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 22 C 11.4 15 12.6 9 12 1.5" />
      {leaves.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
  );

  const filled = (
    <g fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 22 C 11.4 15 12.6 9 12 1.5" />
      {leaves.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="12" height="24" />
        </clipPath>
      </defs>
      {state === "full" && filled}
      {state === "half" && (
        <>
          {outline}
          <g clipPath={`url(#${clipId})`}>{filled}</g>
        </>
      )}
      {state === "empty" && outline}
    </svg>
  );
}

function stateFor(value, index) {
  if (value >= index + 1) return "full";
  if (value >= index + 0.5) return "half";
  return "empty";
}

/**
 * Display form: static row of five sprigs. `0.875rem` in list contexts,
 * `1.25rem` on a full review page.
 */
export function LaurelRating({ value, size = 14, className = "" }) {
  if (value == null) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      role="img"
      aria-label={`${value} out of 5`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={stateFor(value, i) === "empty" ? "text-stone" : "text-ochre"}>
          <Sprig state={stateFor(value, i)} size={size} />
        </span>
      ))}
    </span>
  );
}

/**
 * Input form: hover or tap fills sprigs up to the pointer position, with the
 * left half of a sprig meaning the half value. Keyboard accessible via
 * arrow keys / Home / End.
 */
export function LaurelInput({ value, onChange, size = 28, className = "" }) {
  // Each sprig is worth one point. The left half of a sprig is the half value
  // and the right half the whole, the way a half-star rating input behaves.
  function pick(clientX, el, index) {
    const rect = el.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onChange(fraction < 0.5 ? index + 0.5 : index + 1);
  }

  return (
    <div
      className={`inline-flex items-center gap-1 ${className}`}
      role="slider"
      tabIndex={0}
      aria-label="Rating"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value}
      aria-valuetext={`${value} out of 5`}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 1 : 0.5;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          onChange(Math.min(5, value + step));
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(Math.max(0, value - step));
        } else if (e.key === "Home") {
          e.preventDefault();
          onChange(0);
        } else if (e.key === "End") {
          e.preventDefault();
          onChange(5);
        }
      }}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const state = stateFor(value ?? 0, i);
        return (
          <span
            key={i}
            className={`cursor-pointer ${state === "empty" ? "text-stone" : "text-ochre"}`}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(e.clientX, e.currentTarget, i);
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              pick(e.touches[0].clientX, e.currentTarget, i);
            }}
          >
            <Sprig state={state} size={size} />
          </span>
        );
      })}
    </div>
  );
}

export default LaurelRating;
