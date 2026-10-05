import { SIGILS, initialOf, sigilDataUri, sigilKeyOf } from "../utils/sigil";

/**
 * The row of placeholder medallions above the avatar URL field.
 *
 * Each swatch previews exactly what will be stored: a filled circle in the
 * palette colour with the reader's own initial in Cinzel. The chosen one is
 * marked, and the URL field is left free for anyone who would rather paste a
 * real photograph.
 */
export function AvatarPicker({ username, value, onPick, size = 40 }) {
  const letter = initialOf(username);
  const chosen = sigilKeyOf(value);

  return (
    <div className="mb-4">
      <p className="small-caps text-caption font-semibold text-ink-soft">
        Or choose a mark
      </p>
      <div
        className="mt-2 flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Choose a placeholder avatar"
      >
        {SIGILS.map((sigil) => {
          const isChosen = chosen === sigil.key;
          return (
            <button
              key={sigil.key}
              type="button"
              title={sigil.name}
              aria-label={`Use the ${sigil.name} mark`}
              aria-pressed={isChosen}
              onClick={() => onPick(sigilDataUri(letter, sigil))}
              className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-verdigris ${
                isChosen
                  ? "ring-2 ring-ochre ring-offset-2 ring-offset-parchment"
                  : "opacity-80 hover:opacity-100"
              }`}
              style={{
                width: size,
                height: size,
                fontSize: size * 0.55,
                background: `var(${sigil.fill})`,
                color: `var(${sigil.text})`,
              }}
            >
              {letter}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-caption italic text-ink-soft">
        A mark in the house colours, carrying your own initial.
      </p>
    </div>
  );
}
