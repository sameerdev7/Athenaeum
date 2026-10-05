import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createEntry, getEntry, updateEntry } from "../api/journal";
import { listBooks } from "../api/books";
import { useMe } from "../hooks/useMe";
import Markdown from "../components/Markdown";
import PageHeader from "../components/PageHeader";
import { Button, ErrorNote, Field, Input, Select, Spinner, Textarea } from "../components/ui";

// [label, title, before, after, placeholder]
const TOOLS = [
  ["B", "Bold", "**", "**", "bold text"],
  ["I", "Italic", "*", "*", "italic text"],
  ["H", "Heading", "\n## ", "\n", "Heading"],
  ["❝", "Quote", "\n> ", "\n", "A quotation"],
  ["•", "List", "\n- ", "\n", "List item"],
  ["🔗", "Link", "[", "](https://)", "link text"],
  ["🖼", "Image", "![", "](https://)", "caption"],
  ["</>", "Code block", "\n```\n", "\n```\n", "code"],
  ["▦", "Table", "\n| Title | Author |\n| --- | --- |\n| ", " |  |\n", "Row"],
  ["☑", "Task list", "\n- [ ] ", "\n", "To do"],
];

const EMPTY = { title: "", subtitle: "", cover_url: "", book_id: "", body: "", published: false };

/**
 * Write / edit a journal entry. Markdown with a one-click toolbar and a live
 * preview; drafts are private until published.
 */
export default function JournalEditor() {
  const { entryId } = useParams();
  const editing = Boolean(entryId);
  const navigate = useNavigate();
  const { me, ready } = useMe();
  const bodyRef = useRef(null);

  const [form, setForm] = useState(EMPTY);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(editing);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    document.title = `${editing ? "Edit" : "Write"} • Athenaeum Journal`;
    listBooks()
      .then((b) => setBooks([...b].sort((a, c) => a.title.localeCompare(c.title))))
      .catch(() => {});
  }, [editing]);

  useEffect(() => {
    if (!editing || !ready) return;
    let cancelled = false;
    getEntry(entryId)
      .then((e) => {
        if (cancelled) return;
        if (me && e.author.id !== me.id) {
          setError("You can only edit your own entries.");
        } else {
          setForm({
            title: e.title,
            subtitle: e.subtitle ?? "",
            cover_url: e.cover_url ?? "",
            book_id: e.book?.id ?? "",
            body: e.body,
            published: e.published,
          });
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [editing, entryId, ready, me]);

  const set = (k) => (e) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const words = useMemo(() => (form.body.trim() ? form.body.trim().split(/\s+/).length : 0), [form.body]);

  function applyTool([, , before, after, placeholder]) {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const chosen = value.slice(a, b) || placeholder;
    const next = value.slice(0, a) + before + chosen + after + value.slice(b);
    setSaved(false);
    setForm((f) => ({ ...f, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + before.length, a + before.length + chosen.length);
    });
  }

  async function save(publish) {
    setError("");
    if (!form.title.trim() || !form.body.trim()) {
      setError("An entry needs a title and some text.");
      return;
    }
    setBusy(true);
    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      cover_url: form.cover_url.trim() || null,
      book_id: form.book_id ? Number(form.book_id) : null,
      body: form.body,
      published: publish,
    };
    try {
      const entry = editing ? await updateEntry(entryId, payload) : await createEntry(payload);
      if (entry.published) {
        navigate(`/journal/${entry.id}`);
      } else if (!editing) {
        navigate(`/journal/${entry.id}/edit`, { replace: true });
      } else {
        setForm((f) => ({ ...f, published: false }));
        setSaved(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        size="section"
        title={editing ? "Edit entry" : "Write an entry"}
        subtitle="Full markdown works here — tables, task lists, code, footnotes, images and more. Use Preview to check."
      />

      <div className="mt-8 flex flex-col gap-5">
        <ErrorNote error={error} />
        {saved && (
          <p className="rounded-lg border border-verdigris bg-verdigris-soft px-4 py-2.5 text-uitext text-verdigris">
            Draft saved.
          </p>
        )}

        <Field label="Title" id="title">
          <Input id="title" value={form.title} onChange={set("title")} maxLength={150} placeholder="A title worth clicking" />
        </Field>
        <Field label="Subtitle" id="subtitle" hint="Optional — one line that frames the piece.">
          <Input id="subtitle" value={form.subtitle} onChange={set("subtitle")} maxLength={300} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="About a book" id="book" hint="Optional.">
            <Select id="book" value={form.book_id} onChange={set("book_id")}>
              <option value="">— Not about one book —</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} — {b.author}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cover image link" id="cover" hint="Optional. Defaults to the book's cover.">
            <Input id="cover" value={form.cover_url} onChange={set("cover_url")} placeholder="https://…" maxLength={500} />
          </Field>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="body" className="small-caps text-caption font-semibold text-ink-soft">
              Body
            </label>
            <div className="flex items-center gap-1.5">
              {!preview &&
                TOOLS.map((t) => (
                  <button
                    key={t[1]}
                    type="button"
                    title={t[1]}
                    aria-label={t[1]}
                    onClick={() => applyTool(t)}
                    className="grid h-8 min-w-8 place-items-center rounded-lg border border-stone bg-vellum-deep px-2 text-uitext font-bold text-ink-soft hover:border-ochre hover:text-ochre"
                  >
                    {t[0]}
                  </button>
                ))}
              <button
                type="button"
                onClick={() => setPreview((p) => !p)}
                className="small-caps ml-1 rounded-full border border-stone px-3 py-1 text-caption font-bold text-ink-soft hover:border-tyrian hover:text-ink"
              >
                {preview ? "Edit" : "Preview"}
              </button>
            </div>
          </div>

          {preview ? (
            <div className="tablet-edge mt-2 min-h-[24rem] rounded-2xl bg-vellum-deep p-6 sm:p-8">
              {form.body.trim() ? <Markdown source={form.body} /> : <p className="italic text-ink-soft">Nothing to preview yet.</p>}
            </div>
          ) : (
            <Textarea
              id="body"
              ref={bodyRef}
              rows={18}
              value={form.body}
              onChange={set("body")}
              maxLength={50000}
              className="mt-2 !leading-[1.8]"
              placeholder="Begin where the thought begins…"
            />
          )}
          <p className="nums mt-1.5 text-caption text-ink-soft">
            {words} words · about {Math.max(1, Math.round(words / 220))} min read
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-stone pt-5">
          {form.published ? (
            <>
              <Button onClick={() => save(true)} disabled={busy}>
                {busy ? "Saving…" : "Update entry"}
              </Button>
              <Button variant="secondary" onClick={() => save(false)} disabled={busy}>
                Move to drafts
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => save(true)} disabled={busy}>
                {busy ? "Saving…" : "Publish"}
              </Button>
              <Button variant="secondary" onClick={() => save(false)} disabled={busy}>
                Save draft
              </Button>
            </>
          )}
          <Link
            to={editing ? `/journal/${entryId}` : "/journal"}
            className="small-caps ml-auto text-caption font-bold text-ink-soft hover:text-ink"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
