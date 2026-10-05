import { Link } from "react-router-dom";
import { ListCollage } from "./ListCollage";
import { Avatar } from "./ui";

/** A list in a directory: overlapping covers, title, owner and size. */
export function ListCard({ list, info, owner, mine = false }) {
  return (
    <Link
      to={`/lists/${list.id}`}
      className="tablet-edge reveal group flex flex-col rounded-2xl bg-vellum-deep p-4"
    >
      <ListCollage list={list} books={info?.books ?? []} />
      <h2 className="mt-4 font-display text-cardtitle font-bold leading-snug text-ink group-hover:text-aurora">
        {list.title}
      </h2>
      <div className="mt-2 flex items-center gap-2 text-caption text-ink-soft">
        {owner && <Avatar user={owner} size={20} ring={1} />}
        <span>
          by <span className="font-semibold text-ink">{owner?.username ?? "…"}</span>
        </span>
        {info && (
          <>
            <span aria-hidden="true">·</span>
            <span className="nums">
              {info.count} {info.count === 1 ? "book" : "books"}
            </span>
          </>
        )}
        {list.is_ranked && <span className="small-caps ml-auto font-bold text-ochre">Ranked</span>}
        {mine && <span className="small-caps font-bold text-verdigris">Yours</span>}
      </div>
      {list.description && (
        <p className="truncate-lines-3 mt-2.5 text-uitext leading-relaxed text-ink-soft">
          {list.description}
        </p>
      )}
    </Link>
  );
}
