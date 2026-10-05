import { Link } from "react-router-dom";
import { Cover } from "./BookCard";

/** Landing hero: big gradient headline, live stats, and a drifting cover marquee. */
export default function Hero({ books, actions = null }) {
  const covers = (books ?? []).filter((b) => b.cover_url).slice(0, 18);
  return (
    <section className="rise-in relative mb-10">
      <div className="relative mx-auto max-w-3xl pt-8 text-center sm:pt-14">
        <div aria-hidden="true" className="sun-disc" />
        <h1 className="text-[clamp(2.2rem,6.4vw,4.6rem)] font-bold leading-[1.05]">
          Every book is a
          <br />
          <span className="text-aurora font-body font-medium italic tracking-normal">conversation.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-body italic text-ink-soft sm:text-lg">
          Log what you read, rate it, argue about it. Discover what a whole
          reading room is obsessed with right now.
        </p>
        {actions && <div className="mt-7 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
      </div>

      {covers.length > 5 && (
        <div
          className="marquee relative -mx-4 mt-12 overflow-hidden py-4"
          style={{
            maskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
            WebkitMaskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
          }}
        >
          <div className="marquee-track">
            {[...covers, ...covers].map((b, i) => (
              <Link
                key={`${b.id}-${i}`}
                to={`/books/${b.id}`}
                tabIndex={i >= covers.length ? -1 : 0}
                aria-hidden={i >= covers.length}
                className="block w-28 shrink-0 transition-transform duration-300 hover:-translate-y-2 sm:w-36"
                style={{ transform: i % 2 ? "translateY(14px)" : undefined }}
              >
                <Cover book={b} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
