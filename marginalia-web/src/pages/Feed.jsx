import { useEffect, useState } from "react";
import { getFeed } from "../api/logs";
import { hydrateLogs } from "../api/catalog";
import { getFollowing } from "../api/users";
import { useMe } from "../hooks/useMe";
import { LogCard } from "../components/BookCard";
import PageHeader from "../components/PageHeader";

import {
  Avatar,
  Button,
  EmptyState,
  ErrorNote,
  Spinner,
} from "../components/ui";
import { pluralize } from "../utils/format";

const LIMIT = 20;

/**
 * GET /api/logs/feed — recent reading logs from people the signed-in reader
 * follows. Route is behind ProtectedRoute in App.jsx, so a token always
 * exists here; the "Following" avatar row is a secondary fetch keyed off
 * `me`, not the feed request itself.
 */
export default function Feed() {
  const { me, ready } = useMe();
  const [logs, setLogs] = useState(null);
  const [following, setFollowing] = useState([]);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    document.title = "Feed • Athenaeum";
    // useMe() resolves `me` a tick after mount, so waiting for `ready` here
    // (rather than depending on `[me]` directly) avoids fetching the feed
    // twice in a row — once before the user loads, once right after.
    if (!ready) return;
    Promise.all([getFeed({ limit: LIMIT }), me ? getFollowing(me.id) : []])
      .then(async ([page, followingList]) => {
        // The feed returns bare user_id/book_id, so it needs the same
        // hydration loadMore() does, otherwise bylines and titles are missing.
        setLogs(await hydrateLogs(page));
        setFollowing(followingList);
        setHasMore(page.length === LIMIT);
      })
      .catch((err) => setError(err.message));
  }, [me, ready]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await hydrateLogs(await getFeed({ limit: LIMIT, offset }));
      setOffset((o) => o + LIMIT);
      setLogs((prev) => [...prev, ...next]);
      setHasMore(next.length === LIMIT);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto max-w-[640px] px-4 py-8">
      <PageHeader
        title="Activity"
        subtitle="What the people you follow have been reading."
      />

      {error && <ErrorNote error={error} className="mt-6" />}

      {following.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-caption text-ink-soft">Following</span>
          {following.slice(0, 8).map((u) => (
            <Avatar key={u.id} user={u} size={24} />
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-4">
        {!logs && <Spinner />}

        {logs?.length === 0 && (
          <EmptyState
            message={
              following.length === 0
                ? "You're not following anyone yet — find a reader whose taste you trust."
                : "No activity yet. When the people you follow log a book, it lands here."
            }
            action={
              following.length === 0 ? (
                <Button as="link" to="/discover">
                  Browse the catalogue
                </Button>
              ) : null
            }
          />
        )}

        {logs?.map((log) => (
          <LogCard key={log.id} log={log} to={`/logs/${log.id}`} />
        ))}

        {hasMore && (
          <Button
            variant="secondary"
            onClick={loadMore}
            disabled={loadingMore}
            className="mx-auto"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        )}

        {logs && logs.length > 0 && (
          <p className="nums pt-2 text-center text-caption text-ink-soft">
            {pluralize(logs.length, "entry", "entries")}
          </p>
        )}
      </div>
    </div>
  );
}
