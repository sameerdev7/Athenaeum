import { useEffect, useState } from "react";
import { createList, getListItems, getLists } from "../api/lists";
import { getUsers } from "../api/users";
import { useAuth } from "../context/AuthContext";
import { useMe } from "../hooks/useMe";
import { ListCard } from "../components/ListCard";
import PageHeader from "../components/PageHeader";
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
 * The Lists directory — every reader's lists, newest first, public to browse.
 * Getting a cover collage on each card means fetching each list's own items
 * (loadCovers, below) — genuinely N+1 against GET /api/lists/{id}/items, one
 * call per list on the page. Accepted deliberately: the alternative is a
 * text-only directory, and at this catalogue's scale N+1 here is cheap.
 */
export default function Lists() {
  const { token } = useAuth();
  const { me } = useMe();
  const [lists, setLists] = useState(null);
  const [covers, setCovers] = useState({});
  const [users, setUsers] = useState({});
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", is_ranked: false });
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);

  // Each list's covers come from its own items, which already carry the nested
  // book. A list that fails to answer simply renders its title panel.
  async function loadCovers(loaded) {
    const pairs = await Promise.all(
      loaded.map(async (list) => {
        try {
          const items = await getListItems(list.id);
          return [list.id, { books: items.slice(0, 5).map((i) => i.book), count: items.length }];
        } catch {
          return [list.id, { books: [], count: 0 }];
        }
      }),
    );
    setCovers(Object.fromEntries(pairs));
  }

  async function load() {
    try {
      const loaded = await getLists({ limit: 50 });
      setLists(loaded);
      loadCovers(loaded);
      getUsers()
        .then((all) => setUsers(Object.fromEntries(all.map((u) => [u.id, u]))))
        .catch(() => {});
    } catch (err) {
      setError(err.message);
      setLists([]);
    }
  }

  useEffect(() => {
    document.title = "Lists • Athenaeum";
    load();
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    setSaveError("");
    setBusy(true);
    try {
      const list = await createList({
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        is_ranked: draft.is_ranked,
      });
      setDraft({ title: "", description: "", is_ranked: false });
      setShowForm(false);
      setLists((prev) => [list, ...(prev ?? [])]);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title="Lists"
        subtitle="Curated collections — ranked or simply gathered."
      >
        {token && (
          <div className="mt-6">
            <Button onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "New List"}
            </Button>
          </div>
        )}
      </PageHeader>

      <ErrorNote error={error} className="mt-6" />

      {showForm && (
        <Card className="mt-6 p-5">
          <form onSubmit={onCreate} className="flex flex-col gap-4">
            <ErrorNote error={saveError} />
            <Field label="Title" id="title">
              <Input
                id="title"
                value={draft.title}
                maxLength={150}
                required
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              />
            </Field>
            <Field label="Description" id="description" hint="Optional.">
              <Textarea
                id="description"
                rows={2}
                maxLength={1000}
                value={draft.description}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-uitext text-ink">
              <input
                type="checkbox"
                checked={draft.is_ranked}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, is_ranked: e.target.checked }))
                }
                className="h-4 w-4 accent-[var(--terracotta)]"
              />
              Ranked list — show position numbers
            </label>
            <Button type="submit" disabled={busy} className="self-start">
              {busy ? "Creating…" : "Create List"}
            </Button>
          </form>
        </Card>
      )}

      <div className="mt-8">
        {!lists && <Spinner />}
        {lists?.length === 0 && (
          <EmptyState
            message="No lists yet — start one and gather a shelf."
            action={
              token ? (
                <Button onClick={() => setShowForm(true)}>New List</Button>
              ) : (
                <Button as="link" to="/login" variant="secondary">
                  Sign in to create one
                </Button>
              )
            }
          />
        )}

        {lists?.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                info={covers[list.id]}
                owner={users[list.user_id]}
                mine={Boolean(me && list.user_id === me.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
