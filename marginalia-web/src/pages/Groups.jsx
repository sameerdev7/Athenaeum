import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createGroup, listGroups } from "../api/groups";
import { useMe } from "../hooks/useMe";
import { Meander, WaxSeal } from "../components/Motifs";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Spinner,
  Textarea,
} from "../components/ui";

/**
 * The Groups Directory — the way in to the Group Hall, the Scriptorium and
 * the Agora. docs/DESIGN.md asks for a card grid "less ornate than book
 * cards (name, description, member count)"; the group has no cover art, so
 * the wax seal stands in for a poster.
 */
export default function Groups() {
  const { me, ready: meReady } = useMe();
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    setError("");
    listGroups()
      .then(setGroups)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    document.title = "Groups • Athenaeum";
    load();
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) return;
    setBusy(true);
    setActionError("");
    try {
      const created = await createGroup({
        name,
        description: draft.description.trim() || null,
      });
      setGroups((prev) => [created, ...(prev ?? [])]);
      setDraft({ name: "", description: "" });
      setOpen(false);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-aurora pb-1 text-page">Groups</h1>
          <div className="mt-4">
            <Meander />
          </div>
          <p className="mt-4 text-uitext italic text-ink-soft">
            Reading rooms, each with its own hall, scriptorium, and agora.
          </p>
        </div>
        {meReady && me && !open && (
          <Button onClick={() => setOpen(true)}>New Group</Button>
        )}
      </div>

      <ErrorNote error={actionError} className="mt-6" />
      <ErrorNote error={error} className="mt-6" />

      {open && (
        <Card className="mt-6 p-5">
          <h2 className="font-display text-cardtitle text-ink">New Group</h2>
          <form onSubmit={onCreate} className="mt-4 flex flex-col gap-4">
            <Field label="Name" id="name">
              <Input
                id="name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                maxLength={100}
                required
              />
            </Field>
            <Field label="Description" id="description" hint="Optional.">
              <Textarea
                id="description"
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                rows={2}
                maxLength={1000}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !draft.name.trim()}>
                {busy ? "Creating…" : "Create Group"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {groups === null && <Spinner className="mt-10" />}

      {groups && groups.length === 0 && (
        <EmptyState
          className="mt-10"
          message="No groups yet — be the first to convene one."
          action={
            me ? (
              <Button onClick={() => setOpen(true)}>New Group</Button>
            ) : (
              <Button as="link" to="/login" variant="secondary">
                Sign in
              </Button>
            )
          }
        />
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(groups ?? []).map((g) => (
          <Link
            key={g.id}
            to={`/groups/${g.id}`}
            className="tablet-edge block rounded bg-vellum-deep p-4 hover:bg-vellum-deep"
          >
            <div className="flex items-center gap-3">
              <WaxSeal
                initial={g.name.trim().charAt(0).toUpperCase()}
                size={36}
              />
              <h2 className="min-w-0 font-display text-cardtitle truncate text-ink">
                {g.name}
              </h2>
            </div>
            {g.description && (
              <p className="mt-2 line-clamp-2 text-caption italic text-ink-soft">
                {g.description}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
