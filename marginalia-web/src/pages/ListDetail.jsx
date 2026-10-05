import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { listBooks } from "../api/books";
import {
  addListItem,
  deleteList,
  deleteListItem,
  getList,
  getListItems,
  updateList,
} from "../api/lists";
import { useMe } from "../hooks/useMe";
import { BookCard } from "../components/BookCard";
import { ListCollage } from "../components/ListCollage";
import { Meander } from "../components/Motifs";
import {

  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
} from "../components/ui";
import { pluralize } from "../utils/format";

/**
 * A single list: its own cover collage, an edit-in-place form for the owner
 * (view and edit share this one component rather than a separate route),
 * the add-item form, and the poster grid of its books. `allBooks` loads the
 * whole catalogue once just to build the "add a book" dropdown's options —
 * fine while the catalogue is a few hundred books, would need pagination or
 * a search box instead if that grows much further.
 */
export default function ListDetail() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const { me } = useMe();

  const [list, setList] = useState(null);
  const [items, setItems] = useState(null);
  const [allBooks, setAllBooks] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", is_ranked: false });
  const [saveError, setSaveError] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState({ book_id: "", position: 1, note: "" });
  const [addError, setAddError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, i] = await Promise.all([getList(listId), getListItems(listId)]);
      setList(l);
      setItems(i);
      setDraft({
        title: l.title,
        description: l.description ?? "",
        is_ranked: l.is_ranked,
      });
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [listId]);

  useEffect(() => {
    document.title = "List • Athenaeum";
    load();
    // Silently-swallowed on purpose: this only feeds the "add a book"
    // dropdown, so a failure here just means an empty/short options list
    // rather than something worth an error banner on the whole page.
    listBooks().then(setAllBooks).catch(() => {});
  }, [load]);

  const isMine = Boolean(me && list && list.user_id === me.id);
  const onList = new Set((items ?? []).map((i) => i.book_id));
  const addable = allBooks.filter((b) => !onList.has(b.id));

  async function onSave(e) {
    e.preventDefault();
    setSaveError("");
    setBusy(true);
    try {
      const updated = await updateList(list.id, {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        is_ranked: draft.is_ranked,
      });
      setList(updated);
      setEditing(false);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    try {
      await deleteList(list.id);
      navigate("/lists");
    } catch (err) {
      setError(err.message);
    }
  }

  async function onAdd(e) {
    e.preventDefault();
    setAddError("");
    setBusy(true);
    try {
      const item = await addListItem(list.id, {
        book_id: Number(addDraft.book_id),
        position: Number(addDraft.position),
        note: addDraft.note.trim() || null,
      });
      setItems((prev) =>
        [...(prev ?? []), item].sort((a, b) => a.position - b.position),
      );
      setAddDraft({ book_id: "", position: items.length + 1, note: "" });
      setAddOpen(false);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveItem(itemId) {
    try {
      await deleteListItem(list.id, itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      setError(err.message);
    }
  }

  if (error && !list) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ErrorNote error={error} />
        <Link to="/lists" className="small-caps mt-6 inline-block text-uitext font-semibold text-terracotta">
          Back to Lists
        </Link>
      </div>
    );
  }
  if (!list) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        to="/lists"
        className="small-caps text-caption font-semibold text-terracotta hover:opacity-80"
      >
        ← All Lists
      </Link>

      {/* The list leads with its books, the same way the card in /lists does. */}
      <div className="mt-4 w-full max-w-md shrink-0 sm:mt-6">
        <ListCollage list={list} books={(items ?? []).slice(0, 5).map((i) => i.book)} />
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {editing ? (
          <form onSubmit={onSave} className="flex-1">
            <Field label="Title" id="title">
              <Input
                id="title"
                value={draft.title}
                maxLength={150}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              />
            </Field>
            <div className="mt-3">
              <Field label="Description" id="description">
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
            </div>
            <label className="mt-3 flex items-center gap-2 text-uitext text-ink">
              <input
                type="checkbox"
                checked={draft.is_ranked}
                onChange={(e) => setDraft((d) => ({ ...d, is_ranked: e.target.checked }))}
                className="h-4 w-4 accent-[var(--terracotta)]"
              />
              Ranked list
            </label>
          </form>
        ) : (
          <div>
            <h1 className="font-display text-page leading-tight text-ink">
              {list.title}
            </h1>
            {list.description && (
              <p className="mt-3 max-w-prose text-uitext italic text-ink-soft">
                {list.description}
              </p>
            )}
            <p className="mt-3 flex items-center gap-2 text-caption text-ink-soft">
              {list.is_ranked ? "Ranked" : "Unranked"} ·{" "}
              {pluralize(items?.length ?? 0, "book")}
            </p>
          </div>
        )}

        {isMine && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {editing ? (
              <>
                <Button onClick={onSave} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => setEditing(true)}>Edit</Button>
                <Button onClick={() => setAddOpen((v) => !v)}>
                  {addOpen ? "Cancel" : "Add Book"}
                </Button>
                <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <ErrorNote error={saveError} className="mt-4" />

      {confirmDelete && isMine && (
        <div className="tablet-edge-solid mt-4 rounded bg-parchment p-4">
          <p className="text-uitext text-ink">
            Delete this list? The books on it stay in the catalogue, but the
            list and its ordering go away.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="destructive" onClick={onDelete} disabled={busy}>
              Yes, delete it
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}

      {addOpen && isMine && (
        <Card className="mt-5 p-5">
          <form onSubmit={onAdd} className="flex flex-col gap-4">
            <ErrorNote error={addError} />
            <Field label="Book" id="book_id">
              <Select
                id="book_id"
                value={addDraft.book_id}
                onChange={(e) =>
                  setAddDraft((d) => ({ ...d, book_id: e.target.value }))
                }
                required
              >
                <option value="">Choose…</option>
                {addable.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} — {b.author}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Position" id="position">
                <Input
                  id="position"
                  type="number"
                  min="1"
                  value={addDraft.position}
                  onChange={(e) =>
                    setAddDraft((d) => ({ ...d, position: e.target.value }))
                  }
                />
              </Field>
              <Field label="Note" id="note" hint="Optional.">
                <Input
                  id="note"
                  maxLength={500}
                  value={addDraft.note}
                  onChange={(e) =>
                    setAddDraft((d) => ({ ...d, note: e.target.value }))
                  }
                />
              </Field>
            </div>
            <Button type="submit" disabled={busy || !addDraft.book_id} className="self-start">
              {busy ? "Adding…" : "Add to List"}
            </Button>
            {addable.length === 0 && (
              <p className="text-uitext italic text-ink-soft">
                Every catalogued book is already on this list.
              </p>
            )}
          </form>
        </Card>
      )}

      <div className="mt-6">
        <Meander />
      </div>

      <ErrorNote error={error} className="mt-4" />

      <div className="mt-6">
        {!items && <Spinner />}
        {items?.length === 0 && (
          <EmptyState
            message="This list is empty — add the first book to it."
            action={
              isMine ? (
                <Button onClick={() => setAddOpen(true)}>Add a Book</Button>
              ) : null
            }
          />
        )}
        {items?.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {items.map((item) => (
              <div key={item.id} className="relative">
                {/* Ranked lists show position numbers in Cinzel. */}
                {list.is_ranked && (
                  <span className="absolute -left-1 -top-2 z-10 font-display text-cardtitle leading-none text-ochre">
                    {item.position}
                  </span>
                )}
                <BookCard book={item.book} />
                {item.note && (
                  <p className="mt-1 text-caption italic text-ink-soft">
                    {item.note}
                  </p>
                )}
                {isMine && (
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="small-caps absolute right-1 top-1 rounded-lg border border-stone bg-parchment px-1.5 py-0.5 text-caption font-semibold text-error"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
