import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getBook } from "../api/books";
import { loadUsers } from "../api/catalog";
import {
  createComment,
  deleteComment,
  getComments,
  getLikes,
  getLog,
  likeLog,
  unlikeLog,
} from "../api/logs";
import { useAuth } from "../context/AuthContext";
import { Cover, StatusChip } from "../components/BookCard";
import { LaurelRating } from "../components/LaurelRating";
import { Meander } from "../components/Motifs";
import {
  Avatar,
  Button,
  ErrorNote,
  Spinner,
  Textarea,
} from "../components/ui";
import { useMe } from "../hooks/useMe";
import { fullDate, pluralize } from "../utils/format";

/**
 * A single ReadingLog's full page — three fetched pieces (the log itself,
 * its comments, its likers) plus the book and the log's author, neither of
 * which the log response carries directly (see loadUsers() in api/catalog.js
 * for why: ReadingLogResponse only has bare `user_id`/`book_id`).
 *
 * Likes are optimistic: toggleLike() flips the local liker list immediately
 * on click, then reconciles against whatever the server actually says right
 * after — so the button never waits on a round trip to feel responsive, but
 * a failed request still self-corrects via load().
 */
export default function ReviewPage() {
  const { logId } = useParams();
  const { token } = useAuth();
  const { me } = useMe();

  const [log, setLog] = useState(null);
  const [book, setBook] = useState(null);
  const [user, setUser] = useState(null);
  const [comments, setComments] = useState([]);
  const [likers, setLikers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getLog(logId),
      getComments(logId),
      getLikes(logId),
      loadUsers(),
    ])
      .then(async ([l, c, likersList, users]) => {
        setLog(l);
        setComments(c);
        setLikers(likersList);
        setUser(users.get(l.user_id) ?? null);
        const b = await getBook(l.book_id);
        setBook(b);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [logId]);

  useEffect(() => {
    document.title = "Review • Athenaeum";
    load();
  }, [load]);

  async function toggleLike() {
    if (!token) return;
    const liked = likers.some((u) => u.id === me?.id);
    // Optimistic: the liker list is the source of truth for the button state,
    // so flip it locally and reconcile against the server response.
    setLikers((prev) =>
      liked ? prev.filter((u) => u.id !== me.id) : [...prev, me],
    );
    try {
      if (liked) await unlikeLog(logId);
      else await likeLog(logId);
      setLikers(await getLikes(logId));
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  if (loading) return <Spinner />;
  if (error && !log) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ErrorNote error={error} />
      </div>
    );
  }

  const iLiked = Boolean(me && likers.some((u) => u.id === me.id));
  const hasReview = log.review_text?.trim().length > 0;
  const mine = Boolean(me && log.user_id === me.id);
  const roots = comments.filter((c) => !c.parent_id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        to={`/books/${book?.id}`}
        className="small-caps text-caption font-semibold text-terracotta hover:opacity-80"
      >
        ← Back to {book?.title}
      </Link>

      {/* Book cover + metadata at top, laurel at full size */}
      <div className="mt-5 flex flex-col gap-5 sm:flex-row">
        <Link to={`/books/${book?.id}`} className="w-28 shrink-0">
          <Cover book={book ?? { title: "" }} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to={`/books/${book?.id}`}
            className="font-display text-section leading-tight text-ink hover:opacity-80"
          >
            {book?.title}
          </Link>
          <p className="mt-1 text-uitext italic text-ink-soft">{book?.author}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <LaurelRating value={log.rating} size={20} />
            <StatusChip log={log} />
          </div>

          <div className="mt-4 flex items-center gap-2.5">
            <Avatar user={user} size={32} />
            <div className="flex min-w-0 flex-col">
              <Link
                to={`/users/${log.user_id}`}
                className="truncate text-uitext font-semibold text-ink hover:opacity-80"
              >
                {user?.username ?? "Unknown reader"}
              </Link>
              <time dateTime={log.created_at} className="text-caption text-ink-soft">
                {fullDate(log.created_at)}
              </time>
            </div>
            {mine && (
              <Button
                as="link"
                to={`/logs/${log.id}/edit`}
                variant="ghost"
                size="sm"
                className="ml-auto"
              >
                Edit
              </Button>
            )}
          </div>

          {(log.started_at || log.finished_at) && (
            <p className="nums mt-3 text-caption text-ink-soft">
              {log.started_at && `Started ${log.started_at}`}
              {log.started_at && log.finished_at && " · "}
              {log.finished_at && `Finished ${log.finished_at}`}
            </p>
          )}
        </div>
      </div>

      {/* The review body with its Cinzel drop cap — the one place the UI
          quotes illuminated-manuscript convention. Full reads only. */}
      {hasReview && (
        <div className="mt-8">
          <Meander />
          <div className="drop-cap mt-6 text-body leading-[1.75] text-ink">
            {log.review_text}
          </div>
        </div>
      )}

      <ErrorNote error={error} className="mt-6" />

      {/* Likes: an avatar row, not a cold count */}
      <section className="mt-10">
        <h2 className="small-caps text-uitext font-semibold text-ink-soft">
          {pluralize(likers.length, "reader", "readers")} liked this
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {likers.map((u) => (
            <Link key={u.id} to={`/users/${u.id}`} title={u.username}>
              <Avatar user={u} size={32} />
            </Link>
          ))}
          {token && (
            <Button
              variant={iLiked ? "secondary" : "primary"}
              size="sm"
              onClick={toggleLike}
            >
              {iLiked ? "Liked" : "Like"}
            </Button>
          )}
        </div>
      </section>

      {/* Comments: a scaled-down Review Card shape, no rating, one level of
          threading via parent_id */}
      <section className="mt-10">
        <h2 className="font-display text-section text-ink">
          {pluralize(comments.length, "comment")}
        </h2>
        <div className="mt-3">
          <Meander />
        </div>

        <div className="mt-5 flex flex-col gap-4">
          {token ? (
            <CommentForm
              onSubmit={async (body) => {
                const c = await createComment(logId, body);
                setComments((prev) => [...prev, c]);
              }}
            />
          ) : (
            <p className="text-uitext italic text-ink-soft">
              <Link to="/login" className="text-terracotta hover:opacity-80">
                Sign in
              </Link>{" "}
              to leave a note in the margins.
            </p>
          )}

          {roots.length === 0 && (
            <p className="text-uitext italic text-ink-soft">
              No comments yet — be the first to write in the margin.
            </p>
          )}

          {roots.map((c) => (
            <CommentNode
              key={c.id}
              comment={c}
              replies={comments.filter((r) => r.parent_id === c.id)}
              meId={me?.id}
              onReply={async (body) => {
                const r = await createComment(logId, body, c.id);
                setComments((prev) => [...prev, r]);
              }}
              onDelete={async () => {
                await deleteComment(c.id);
                setComments((prev) => prev.filter((x) => x.id !== c.id && x.parent_id !== c.id));
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function CommentForm({ onSubmit, placeholder = "Write a note…", autoFocus = false }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(body.trim());
      setBody("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Textarea
        rows={2}
        value={body}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => setBody(e.target.value)}
      />
      <ErrorNote error={error} />
      <Button type="submit" size="sm" disabled={busy || !body.trim()} className="self-start">
        Post
      </Button>
    </form>
  );
}

function CommentNode({ comment, replies, meId, onReply, onDelete }) {
  const [replying, setReplying] = useState(false);
  const isMine = comment.user_id === meId;

  return (
    <div className="tablet-edge rounded bg-vellum-deep p-3.5">
      <div className="flex items-center gap-2.5">
        <Link to={`/users/${comment.user_id}`}>
          <Avatar user={comment.author} size={32} />
        </Link>
        <div className="flex min-w-0 flex-col">
          <Link
            to={`/users/${comment.user_id}`}
            className="truncate text-uitext font-semibold text-ink hover:opacity-80"
          >
            {comment.author?.username ?? "Unknown"}
          </Link>
          <time dateTime={comment.created_at} className="text-caption text-ink-soft">
            {fullDate(comment.created_at)}
          </time>
        </div>
        {isMine && (
          <button
            onClick={onDelete}
            className="small-caps ml-auto text-caption font-semibold text-error hover:opacity-80"
          >
            Delete
          </button>
        )}
      </div>

      <p className="mt-2.5 text-uitext leading-relaxed text-ink">{comment.body}</p>

      <button
        onClick={() => setReplying((v) => !v)}
        className="small-caps mt-2 text-caption font-semibold text-ink-soft hover:text-ink"
      >
        {replying ? "Cancel" : "Reply"}
      </button>

      {replying && (
        <div className="mt-2">
          <CommentForm
            placeholder={`Reply to ${comment.author?.username ?? "this note"}…`}
            autoFocus
            onSubmit={async (body) => {
              await onReply(body);
              setReplying(false);
            }}
          />
        </div>
      )}

      {replies.length > 0 && (
        <div className="mt-3 flex flex-col gap-3 border-l border-stone pl-3">
          {replies.map((r) => (
            <div key={r.id}>
              <div className="flex items-center gap-2">
                <Link to={`/users/${r.user_id}`}>
                  <Avatar user={r.author} size={24} />
                </Link>
                <Link
                  to={`/users/${r.user_id}`}
                  className="truncate text-caption font-semibold text-ink hover:opacity-80"
                >
                  {r.author?.username ?? "Unknown"}
                </Link>
                {r.user_id === meId && (
                  <span className="ml-auto text-caption text-ink-soft">own note</span>
                )}
              </div>
              <p className="mt-1 text-uitext leading-relaxed text-ink">{r.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
