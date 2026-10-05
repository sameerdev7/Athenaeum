import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { getFeed, getFriendsPopular, getLogs } from "../api/logs";
import { getLists, getListItems } from "../api/lists";
import { listJournal } from "../api/journal";
import { listBooks } from "../api/books";
import { getFollowing, getUsers } from "../api/users";
import { hydrateLogs } from "../api/catalog";
import { useAuth } from "../context/AuthContext";
import { useMe } from "../hooks/useMe";
import { BookCard, Cover, LogCard } from "../components/BookCard";
import { LaurelRating } from "../components/LaurelRating";
import { ListCard } from "../components/ListCard";
import Hero from "../components/Hero";
import { Avatar, Button } from "../components/ui";
import { EntryCard } from "./Journal";

/** A titled band with a hairline and a "more" link — the home page's rhythm. */
function Section({ title, hint, to, more = "More", children }) {
  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-4 border-b border-stone pb-2">
        <h2 className="small-caps text-uitext font-bold tracking-[0.12em] text-ink-soft">{title}</h2>
        {to && (
          <Link to={to} className="small-caps text-caption font-bold text-ink-soft hover:text-terracotta">
            {more}
          </Link>
        )}
      </div>
      {hint && <p className="mt-2 text-caption italic text-ink-soft">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Horizontally scrolling shelf of fixed-width posters. */
function Shelf({ children }) {
  return (
    <div className="-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:thin]">
      {children}
    </div>
  );
}

function FriendPoster({ log }) {
  return (
    <Link to={`/logs/${log.id}`} className="group reveal w-32 shrink-0 snap-start sm:w-36">
      <Cover
        book={log.book}
        className="transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_22px_36px_-12px_var(--g-b)]"
      />
      <div className="mt-2 flex items-center gap-1.5">
        <Avatar user={log.user} size={18} ring={1} />
        <span className="truncate text-caption font-semibold text-ink">{log.user?.username}</span>
      </div>
      {log.rating != null && <LaurelRating value={log.rating} size={11} className="mt-1" />}
    </Link>
  );
}

function PopularPoster({ item }) {
  return (
    <Link to={`/books/${item.book.id}`} className="group reveal w-32 shrink-0 snap-start sm:w-36">
      <div className="relative">
        <Cover
          book={item.book}
          className="transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_22px_36px_-12px_var(--g-b)]"
        />
        <div className="absolute inset-x-1.5 bottom-1.5 flex items-center gap-1.5 rounded-full bg-black/65 py-1 pl-1 pr-2.5 backdrop-blur">
          <span className="flex -space-x-1.5">
            {item.friends.slice(0, 3).map((f) => (
              <Avatar key={f.id} user={f} size={16} ring={1} />
            ))}
          </span>
          <span className="nums text-[0.7rem] font-bold text-white">{item.readers}</span>
        </div>
      </div>
      <p className="mt-2 truncate text-uitext font-bold text-ink">{item.book.title}</p>
      <p className="truncate text-caption italic text-ink-soft">{item.book.author}</p>
    </Link>
  );
}

function Greeting({ me, reading }) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return (
    <section className="rise-in pt-6">
      <p className="small-caps text-caption font-bold text-ochre">Good {part}</p>
      <h1 className="text-aurora mt-1 pb-1 text-page font-bold leading-[1.1]">
        Welcome back, {me.username}.
      </h1>
      <div className="mt-6 flex flex-wrap items-end gap-6">
        {reading.length > 0 ? (
          <div>
            <p className="small-caps mb-3 text-caption font-bold text-ink-soft">On your nightstand</p>
            <div className="flex gap-3">
              {reading.slice(0, 5).map((log) => (
                <Link key={log.id} to={`/books/${log.book_id}`} className="group w-20 sm:w-24" title={log.book?.title}>
                  <Cover book={log.book} className="transition-transform group-hover:-translate-y-1" />
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <p className="max-w-md text-body italic text-ink-soft">
            Nothing on your nightstand yet. Pick something from the shelves and start a log.
          </p>
        )}
        <div className="flex flex-wrap gap-3 sm:ml-auto">
          <Button as="link" to="/discover">Find a book</Button>
          <Button as="link" to="/journal/new" variant="secondary">Write an entry</Button>
        </div>
      </div>
    </section>
  );
}

/** Shown when you follow nobody: friends' sections need friends. */
function PeopleToFollow({ people }) {
  if (people.length === 0) return null;
  return (
    <Section title="People worth following" hint="Follow a few readers and their activity fills this page.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {people.map((u) => (
          <Link
            key={u.id}
            to={`/users/${u.id}`}
            className="tablet-edge flex flex-col items-center gap-2 rounded-2xl bg-vellum-deep p-4 text-center"
          >
            <Avatar user={u} size={48} ring={2} />
            <span className="w-full truncate text-uitext font-bold text-ink">{u.username}</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

export default function Home() {
  const [params] = useSearchParams();
  const { token } = useAuth();
  const { me, ready } = useMe();
  const [reading, setReading] = useState([]);
  const [friendLogs, setFriendLogs] = useState(null);
  const [popular, setPopular] = useState(null);
  const [following, setFollowing] = useState(null);
  const [people, setPeople] = useState([]);
  const [entries, setEntries] = useState([]);
  const [lists, setLists] = useState([]);
  const [listExtras, setListExtras] = useState({ info: {}, users: {} });
  const [reviews, setReviews] = useState([]);
  const [fresh, setFresh] = useState([]);
  const [books, setBooks] = useState(null);

  useEffect(() => {
    document.title = "Athenaeum";
  }, []);

  // Public sections: the same for everyone.
  useEffect(() => {
    let live = true;
    const ok = (fn) => (v) => live && fn(v);
    listJournal({ limit: 3 }).then(ok(setEntries)).catch(() => {});
    getLogs({ sort: "popular", has_review: true, limit: 3 })
      .then(hydrateLogs)
      .then(ok(setReviews))
      .catch(() => {});
    listBooks()
      .then(ok((b) => {
        setBooks(b);
        setFresh([...b].sort((a, c) => c.id - a.id).slice(0, 12));
      }))
      .catch(() => setBooks([]));
    (async () => {
      try {
        const [ls, all] = await Promise.all([getLists({ limit: 3 }), getUsers().catch(() => [])]);
        const info = {};
        await Promise.all(
          ls.map(async (l) => {
            try {
              const items = await getListItems(l.id);
              info[l.id] = { books: items.slice(0, 5).map((i) => i.book), count: items.length };
            } catch {
              info[l.id] = { books: [], count: 0 };
            }
          }),
        );
        if (live) {
          setLists(ls);
          setListExtras({ info, users: Object.fromEntries(all.map((u) => [u.id, u])) });
        }
      } catch {
        /* lists are optional on the home page */
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // Signed-in sections.
  useEffect(() => {
    if (!token || !ready || !me) return;
    let live = true;
    const ok = (fn) => (v) => live && fn(v);
    getLogs({ user_id: me.id, limit: 50 })
      .then(hydrateLogs)
      .then(ok((ls) => setReading(ls.filter((l) => l.status === "reading"))))
      .catch(() => {});
    getFeed({ limit: 12 })
      .then(hydrateLogs)
      .then(ok(setFriendLogs))
      .catch(() => setFriendLogs([]));
    getFriendsPopular({ days: 90, limit: 12 }).then(ok(setPopular)).catch(() => setPopular([]));
    getFollowing(me.id)
      .then(async (f) => {
        if (!live) return;
        setFollowing(f);
        if (f.length === 0) {
          const all = await getUsers().catch(() => []);
          const skip = new Set([me.id]);
          if (live) setPeople(all.filter((u) => !skip.has(u.id)).slice(0, 6));
        }
      })
      .catch(() => setFollowing([]));
    return () => {
      live = false;
    };
  }, [token, ready, me]);

  // One-click escape hatch back to the pre-redesign landing page.
  if (params.get("ui") === "classic") return <Navigate to="/discover" replace />;

  const signedIn = Boolean(token);
  const noFriends = following && following.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8">
      {signedIn && me ? (
        <Greeting me={me} reading={reading} />
      ) : (
        <Hero
          books={books}
          actions={
            <>
              <Button as="link" to="/register">Join Athenaeum</Button>
              <Button as="link" to="/discover" variant="secondary">Browse the catalogue</Button>
            </>
          }
        />
      )}

      {signedIn && noFriends && <PeopleToFollow people={people} />}

      {signedIn && !noFriends && (
        <>
          <Section title="New from friends" to="/feed" more="All activity">
            {friendLogs === null ? (
              <p className="text-uitext italic text-ink-soft">Gathering the latest…</p>
            ) : friendLogs.length === 0 ? (
              <p className="text-uitext italic text-ink-soft">The people you follow haven't logged anything yet.</p>
            ) : (
              <Shelf>
                {friendLogs.filter((l) => l.book).map((l) => (
                  <FriendPoster key={l.id} log={l} />
                ))}
              </Shelf>
            )}
          </Section>

          {popular?.length > 0 && (
            <Section title="Popular with friends" hint="Books the people you follow have been logging lately.">
              <Shelf>
                {popular.map((p) => (
                  <PopularPoster key={p.book.id} item={p} />
                ))}
              </Shelf>
            </Section>
          )}
        </>
      )}

      {entries.length > 0 && (
        <Section title="From the Journal" to="/journal" more="All entries">
          <div className="grid gap-6 md:grid-cols-3">
            {entries.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
        </Section>
      )}

      {lists.length > 0 && (
        <Section title="Lists to browse" to="/lists" more="All lists">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map((l) => (
              <ListCard
                key={l.id}
                list={l}
                info={listExtras.info[l.id]}
                owner={listExtras.users[l.user_id]}
                mine={Boolean(me && l.user_id === me.id)}
              />
            ))}
          </div>
        </Section>
      )}

      {reviews.length > 0 && (
        <Section title="Popular reviews" to="/discover" more="Browse books">
          <div className="grid gap-4 lg:grid-cols-3">
            {reviews.map((r) => (
              <LogCard key={r.id} log={r} to={`/logs/${r.id}`} />
            ))}
          </div>
        </Section>
      )}

      {fresh.length > 0 && (
        <Section title="Fresh on the shelves" to="/discover" more="Discover">
          <Shelf>
            {fresh.map((b) => (
              <div key={b.id} className="w-32 shrink-0 snap-start sm:w-36">
                <BookCard book={b} />
              </div>
            ))}
          </Shelf>
        </Section>
      )}
    </div>
  );
}
