import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  followUser,
  getFollowers,
  getFollowing,
  getUser,
  unfollowUser,
  updateUser,
  uploadAvatar,
} from "../api/users";
import { getLogs } from "../api/logs";
import { hydrateLogs, invalidateCatalog } from "../api/catalog";
import { useAuth } from "../context/AuthContext";
import { DiaryRow } from "../components/BookCard";
import { AvatarPicker } from "../components/AvatarPicker";
import { ColumnFlute, Meander } from "../components/Motifs";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Spinner,
} from "../components/ui";
import { setMe, useMe } from "../hooks/useMe";
import { pluralize, STATUS } from "../utils/format";
import { refreshSigil } from "../utils/sigil";

const FILTERS = [
  { value: "", label: "All" },
  ...Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })),
];

/**
 * One component behind three routes: /profile (yourself), /profile/edit
 * (the `editing` prop — see App.jsx), and /users/:userId (anyone). `isSelf`
 * decides what renders (Edit/Sign Out vs. Follow, the diary vs. the edit
 * form) — there is no separate "other person's profile" component.
 */
export default function Profile({ editing = false }) {
  const { userId } = useParams();
  const { token, logout } = useAuth();
  const { me, ready: meReady } = useMe();

  // /profile has no id in the route; it resolves to the signed-in user.
  const id = userId ?? me?.id;

  const [profile, setProfile] = useState(null);
  const [logs, setLogs] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState({ username: "", avatar_url: "" });
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const isSelf = Boolean(me && id && me.id === Number(id));

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [p, l, f, g] = await Promise.all([
        getUser(id),
        getLogs({ user_id: id, limit: 50 }),
        getFollowers(id),
        getFollowing(id),
      ]);
      setProfile(p);
      setLogs(await hydrateLogs(l));
      setFollowers(f);
      setFollowing(g);
      setDraft({ username: p.username, avatar_url: p.avatar_url ?? "" });
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (meReady && !userId && !me) return; // unauthenticated, /profile is protected
    load();
  }, [load, meReady, me, userId]);

  async function onFollow() {
    setFollowBusy(true);
    try {
      if (isFollowing) await unfollowUser(id);
      else await followUser(id);
      setFollowing(await getFollowing(id));
      setFollowers(await getFollowers(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setFollowBusy(false);
    }
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSaveError("");
    setSaved(false);
    setUploading(true);
    try {
      // The server stores the file and updates the avatar in one step.
      const updated = await uploadAvatar(file);
      setProfile(updated);
      setMe(updated);
      setDraft((d) => ({ ...d, avatar_url: updated.avatar_url ?? "" }));
      invalidateCatalog();
      setSaved(true);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function onSave(e) {
    e.preventDefault();
    setSaveError("");
    setSaved(false);
    setBusy(true);
    try {
      const updated = await updateUser(me.id, {
        username: draft.username.trim(),
        // A chosen mark carries the reader's initial, so it is re-lettered if
        // the name changed; a real photo URL is left exactly as typed.
        avatar_url: refreshSigil(
          draft.avatar_url.trim(),
          draft.username.trim(),
        ) || null,
      });
      setProfile(updated);
      setMe(updated);
      invalidateCatalog();
      setSaved(true);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!id && meReady && !me) return <Spinner />;
  if (loading && !profile) return <Spinner />;
  if (error && !profile) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ErrorNote error={error} />
      </div>
    );
  }
  if (!profile) return <Spinner />;

  // "Am I following them?" means I appear in *their* followers, not in the
  // accounts they follow. Checking `following` here always read false.
  const isFollowing = followers.some((u) => u.id === me?.id);
  const readCount = logs.filter((l) => l.status === "read").length;
  const visible = filter ? logs.filter((l) => l.status === filter) : logs;

  return (
    <div>
      {/* Profile header: full-width band, avatar as a circular medallion,
          username in Cinzel, stats in tabular numerals — the "bust plaque." */}
      <header className="tablet-edge mx-3 mt-4 rounded-[18px] bg-vellum-deep sm:mx-auto sm:max-w-4xl">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-10 text-center">
          <Avatar user={profile} size={96} ring={3} />
          <div>
            <h1 className="text-aurora pb-1 text-section">
              {profile.username}
            </h1>
            <p className="nums mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-uitext text-ink-soft">
              <span>{pluralize(readCount, "book")} read</span>
              <span>{pluralize(followers.length, "follower")}</span>
              <span>{`${following.length} following`}</span>
              <span>{pluralize(logs.length, "entry", "entries")}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {isSelf ? (
              <>
                <Button as="link" to="/profile/edit" variant="secondary">
                  Edit Profile
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    logout();
                  }}
                >
                  Sign Out
                </Button>
              </>
            ) : (
              token && (
                <Button
                  variant={isFollowing ? "destructive" : "primary"}
                  onClick={onFollow}
                  disabled={followBusy}
                >
                  {followBusy
                    ? "…"
                    : isFollowing
                      ? "Unfollow"
                      : "Follow"}
                </Button>
              )
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4">
        <div className="py-6">
          <Meander />
        </div>

        <ErrorNote error={error} className="mb-4" />

        {editing && isSelf ? (
          <Card className="p-5">
            <h2 className="font-display text-cardtitle text-ink">Edit Profile</h2>
            <form onSubmit={onSave} className="mt-4 flex flex-col gap-4">
              <ErrorNote error={saveError} />
              {saved && (
                <p className="rounded-lg border border-verdigris bg-verdigris-soft px-3 py-2 text-uitext text-verdigris">
                  Saved.
                </p>
              )}
              <Field label="Username" id="username">
                <Input
                  id="username"
                  value={draft.username}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, username: e.target.value }))
                  }
                  required
                  maxLength={50}
                />
              </Field>
              <div>
                <p className="small-caps text-caption font-semibold text-ink-soft">
                  Upload a picture
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Avatar user={{ username: draft.username, avatar_url: draft.avatar_url }} size={56} />
                  <label className="inline-flex cursor-pointer items-center rounded-full border border-stone bg-vellum-deep px-4 py-2 text-uitext font-bold text-ink hover:border-ochre hover:text-ochre">
                    {uploading ? "Uploading…" : "Choose image"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="sr-only"
                      disabled={uploading}
                      onChange={onUpload}
                    />
                  </label>
                  <span className="text-caption text-ink-soft">PNG, JPEG, GIF or WebP · up to 2 MB</span>
                </div>
              </div>
              <AvatarPicker
                username={draft.username}
                value={draft.avatar_url}
                onPick={(avatarUrl) =>
                  setDraft((d) => ({ ...d, avatar_url: avatarUrl }))
                }
              />
              <Field
                label="Avatar link"
                id="avatar_url"
                hint="Or paste a link to an image. Leave blank to fall back to your initial."
              >
                <Input
                  id="avatar_url"
                  value={draft.avatar_url}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, avatar_url: e.target.value }))
                  }
                  placeholder="https://…"
                />
              </Field>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save Changes"}
                </Button>
                <Button as="link" to="/profile" variant="ghost">
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-section text-ink">
                {isSelf ? "My Diary" : "Diary"}
              </h2>
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setFilter(f.value)}
                    className={`small-caps rounded-full border px-3.5 py-1.5 text-caption font-bold ${
                      filter === f.value
                        ? "btn-aurora"
                        : "border-stone bg-vellum-deep text-ink-soft backdrop-blur hover:-translate-y-0.5 hover:border-tyrian hover:text-ink"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              {visible.length === 0 ? (
                <EmptyState
                  message={
                    filter
                      ? `Nothing filed under ${FILTERS.find((f) => f.value === filter)?.label}.`
                      : "No entries yet — the first page is still blank."
                  }
                  action={
                    isSelf ? (
                      <Button as="link" to="/discover">
                        Find a book to log
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <div className="flex flex-col gap-2.5">
                  {visible.map((log) => (
                    <DiaryRow key={log.id} log={log} to={`/logs/${log.id}`} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {(followers.length > 0 || following.length > 0) && (
          <div className="mt-12">
            <div className="py-4">
              <ColumnFlute />
            </div>
            <div className="grid gap-8 sm:grid-cols-2">
              <PersonList title="Followers" people={followers} />
              <PersonList title="Following" people={following} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PersonList({ title, people }) {
  if (people.length === 0) return null;
  return (
    <section>
      <h3 className="small-caps text-uitext font-semibold text-ink-soft">
        {title} · {people.length}
      </h3>
      <ul className="mt-3 flex flex-col gap-2.5">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5">
            <Avatar user={p} size={32} />
            <Link
              to={`/users/${p.id}`}
              className="text-uitext font-semibold text-ink hover:opacity-80"
            >
              {p.username}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
