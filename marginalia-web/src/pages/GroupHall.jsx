import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getGroup,
  isGroupOwner,
  isMember,
  joinGroup,
  leaveGroup,
  listMembers,
} from "../api/groups";
import { createPost, deletePost, listPosts } from "../api/posts";
import { useMe } from "../hooks/useMe";
import { ColumnFlute, Meander, WaxSeal } from "../components/Motifs";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Spinner,
  Textarea,
} from "../components/ui";

/**
 * The Group Hall. docs/DESIGN.md: profile-header pattern reused with the
 * group's data, the owner carries a Wax Seal in the roster, and a column
 * flute separates the info/member panel from the post feed below.
 *
 * Posts live here (REST). The Scriptorium and the Agora are separate routes
 * with their own interaction models — deliberately not tabs of this feed.
 */
export default function GroupHall() {
  const { groupId } = useParams();
  const { me, ready: meReady } = useMe();

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    try {
      const [g, m, p] = await Promise.all([
        getGroup(groupId),
        listMembers(groupId),
        listPosts(groupId),
      ]);
      setGroup(g);
      setMembers(m);
      setPosts(p);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [groupId]);

  useEffect(() => {
    document.title = "Group • Athenaeum";
    load();
  }, [load]);

  const member = isMember(members, me?.id);
  const owner = isGroupOwner(group, me?.id);

  async function onJoin() {
    setBusy(true);
    setActionError("");
    try {
      await joinGroup(groupId);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onLeave() {
    setBusy(true);
    setActionError("");
    try {
      await leaveGroup(groupId);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onPost(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setActionError("");
    try {
      const created = await createPost(groupId, body);
      setPosts((prev) => [created, ...(prev ?? [])]);
      setDraft("");
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDeletePost(postId) {
    setBusy(true);
    setActionError("");
    try {
      await deletePost(postId);
      setPosts((prev) => (prev ?? []).filter((p) => p.id !== postId));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !group) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorNote error={error} />
        <Link
          to="/groups"
          className="small-caps mt-6 inline-block text-uitext text-verdigris"
        >
          ← All groups
        </Link>
      </div>
    );
  }
  if (!group) return <Spinner />;

  return (
    <div>
      {/* Profile-header pattern, reused with the group's data */}
      <header className="border-b border-stone bg-vellum-deep">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-[3px] border-ochre bg-parchment">
              <WaxSeal initial={group.name.trim().charAt(0).toUpperCase()} size={40} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-aurora pb-1 text-page">{group.name}</h1>
              {group.description && (
                <p className="mt-2 text-uitext italic text-ink-soft">
                  {group.description}
                </p>
              )}
              <p className="nums mt-3 text-caption text-ink-soft">
                {members.length} {members.length === 1 ? "member" : "members"}
                {owner && " · you're the owner"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {me && member && !owner && (
                <Button
                  variant="destructive"
                  onClick={onLeave}
                  disabled={busy}
                >
                  Leave
                </Button>
              )}
              {me && !member && (
                <Button onClick={onJoin} disabled={busy}>
                  {busy ? "Joining…" : "Join group"}
                </Button>
              )}
              {!meReady || !me ? (
                <Button as="link" to="/login" variant="secondary">
                  Sign in to join
                </Button>
              ) : null}
            </div>
          </div>

          {/* Chat and the Agora are their own pages, not tabs of the feed */}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button as="link" to={`/groups/${groupId}/chat`} variant="secondary">
              The Scriptorium
            </Button>
            <Button as="link" to={`/groups/${groupId}/agora`} variant="secondary">
              The Agora
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4">
        <div className="py-6">
          <ColumnFlute />
        </div>
      </div>

      <div className="mx-auto max-w-[640px] px-4 pb-16">
        <ErrorNote error={actionError} className="mb-4" />

        <h2 className="font-display text-section text-ink">Posts</h2>
        <div className="mt-4">
          <Meander />
        </div>

        {member ? (
          <form onSubmit={onPost} className="mt-6">
            <Field label="Say something to the group" id="post_body">
              <Textarea
                id="post_body"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="Share a passage, a question, a recommendation…"
              />
            </Field>
            <Button type="submit" disabled={busy || !draft.trim()} className="mt-3">
              {busy ? "Posting…" : "Post"}
            </Button>
          </form>
        ) : (
          <p className="mt-6 text-uitext italic text-ink-soft">
            Join the group to post.
          </p>
        )}

        {posts && posts.length === 0 && (
          <EmptyState
            className="mt-8"
            message="No posts yet — be the first to say something."
          />
        )}

        <div className="mt-6 flex flex-col gap-4">
          {(posts ?? []).map((post) => (
            <Card key={post.id} className="p-4">
              <div className="flex items-center gap-2.5">
                <Avatar user={post.author} size={32} />
                <span className="truncate text-uitext font-semibold text-ink">
                  {post.author?.username}
                </span>
                {post.author?.id === group.owner_id && (
                  <WaxSeal
                    initial={(post.author?.username ?? "?").charAt(0).toUpperCase()}
                    title="Group owner"
                  />
                )}
                <time
                  dateTime={post.created_at}
                  className="ml-auto shrink-0 text-caption text-ink-soft"
                >
                  {new Date(post.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </time>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-uitext text-ink">
                {post.body}
              </p>
              {me && post.user_id === me.id && (
                <div className="mt-3">
                  <Button
                    variant="destructive"
                    onClick={() => onDeletePost(post.id)}
                    disabled={busy}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>

        <h2 className="mt-12 font-display text-section text-ink">Members</h2>
        <div className="mt-4">
          <Meander />
        </div>
        <ul className="mt-6 flex flex-col gap-2">
          {members.map((m) => (
            <li key={m.id} className="tablet-edge-solid flex items-center gap-3 rounded bg-parchment px-3 py-2">
              <Avatar user={m.user} size={32} ring={3} />
              <span className="text-uitext text-ink">{m.user?.username}</span>
              {m.role === "owner" && <WaxSeal initial="◆" title="Group owner" />}
              {m.user?.id === me?.id && (
                <span className="ml-auto text-caption italic text-ink-soft">
                  you
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
