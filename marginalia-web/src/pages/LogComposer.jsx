import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getBook } from "../api/books";
import { createLog, deleteLog, getLog, updateLog } from "../api/logs";
import { Cover } from "../components/BookCard";
import { LaurelInput } from "../components/LaurelRating";
import PageHeader from "../components/PageHeader";
import {
  Button,
  ErrorNote,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
} from "../components/ui";
import { useMe } from "../hooks/useMe";
import { STATUS_OPTIONS } from "../utils/format";

const BLANK = {
  status: "read",
  rating: 0,
  review_text: "",
  started_at: "",
  finished_at: "",
  is_reread: false,
};

/**
 * One component, two routes: /books/:bookId/log (create) and
 * /logs/:logId/edit (edit) — `editing` is just `Boolean(logId)` from the
 * params, and which branch runs decides everything else below (what gets
 * fetched, what POST vs PATCH does on submit, whether Delete shows at all).
 * `rating` of `0` means "unrated" throughout — the API only ever sees a
 * rating field when it's greater than zero (see the payload in onSubmit).
 */
export default function LogComposer() {
  const { bookId, logId } = useParams();
  const navigate = useNavigate();
  const { me, ready } = useMe();
  const editing = Boolean(logId);

  const [book, setBook] = useState(null);
  const [logOwnerId, setLogOwnerId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = editing ? "Edit Log • Athenaeum" : "Log a Book • Athenaeum";
  }, [editing]);

  useEffect(() => {
    if (editing) {
      getLog(logId)
        .then(async (log) => {
          setLogOwnerId(log.user_id);
          setForm({
            status: log.status,
            rating: log.rating ?? 0,
            review_text: log.review_text ?? "",
            started_at: log.started_at ?? "",
            finished_at: log.finished_at ?? "",
            is_reread: log.is_reread,
          });
          return getBook(log.book_id).then(setBook);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
      return;
    }
    getBook(bookId)
      .then(setBook)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [bookId, logId, editing]);

  const set = (k) => (e) =>
    setForm((f) => ({
      ...f,
      [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const payload = {
      status: form.status,
      rating: form.rating > 0 ? form.rating : null,
      review_text: form.review_text.trim() || null,
      started_at: form.started_at || null,
      finished_at: form.finished_at || null,
      is_reread: form.is_reread,
    };
    try {
      if (editing) {
        const log = await updateLog(logId, payload);
        navigate(`/logs/${log.id}`);
      } else {
        const log = await createLog({ ...payload, book_id: Number(bookId) });
        navigate(`/logs/${log.id}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    try {
      await deleteLog(logId);
      navigate(`/books/${book.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;
  if (!book) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ErrorNote error={error || "Book not found."} />
      </div>
    );
  }

  const notMine = editing && ready && me && logOwnerId !== me.id;
  if (notMine) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ErrorNote error="You can only edit your own reading log." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PageHeader
        title={editing ? "Edit Log" : "Log a Book"}
        size="section"
        subtitle={editing ? undefined : "Leave a note in the margins."}
      />

      <div className="mt-6 flex gap-4">
        <div className="w-20 shrink-0">
          <Cover book={book} />
        </div>
        <div className="min-w-0">
          <p className="font-display text-cardtitle leading-snug text-ink">
            {book.title}
          </p>
          <p className="text-uitext italic text-ink-soft">{book.author}</p>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        className="tablet-edge mt-6 rounded bg-vellum-deep p-5"
      >
        <div className="flex flex-col gap-5">
          <ErrorNote error={error} />

          <Field label="Status" id="status">
            <Select id="status" value={form.status} onChange={set("status")}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-col gap-2">
            <span className="text-caption small-caps font-semibold text-ink-soft">
              Rating
            </span>
            <LaurelInput
              value={form.rating}
              onChange={(v) => setForm((f) => ({ ...f, rating: v }))}
            />
            <p className="text-caption text-ink-soft">
              {form.rating > 0
                ? `${form.rating} of 5. Click a sprig's left half for a half point, or leave unrated.`
                : "Optional. Click a sprig's left half for a half point."}
            </p>
          </div>

          <Field
            label="Review"
            id="review_text"
            hint="Optional. Up to 5000 characters — leave a longer thought than a star could hold."
          >
            <Textarea
              id="review_text"
              rows={8}
              maxLength={5000}
              value={form.review_text}
              onChange={set("review_text")}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Started" id="started_at">
              <Input
                id="started_at"
                type="date"
                value={form.started_at ?? ""}
                onChange={set("started_at")}
              />
            </Field>
            <Field label="Finished" id="finished_at">
              <Input
                id="finished_at"
                type="date"
                value={form.finished_at ?? ""}
                onChange={set("finished_at")}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-uitext text-ink">
            <input
              type="checkbox"
              checked={form.is_reread}
              onChange={set("is_reread")}
              className="h-4 w-4 accent-[var(--terracotta)]"
            />
            This is a reread
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save Changes" : "Add to Diary"}
            </Button>
            <Button
              as="link"
              to={`/books/${book.id}`}
              variant="ghost"
            >
              Cancel
            </Button>
            {editing && !confirmDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="ml-auto"
              >
                Delete Log
              </Button>
            )}
            {editing && confirmDelete && (
              <div className="tablet-edge-solid ml-auto rounded bg-parchment p-3">
                <p className="text-uitext text-ink">
                  Delete this log, its review, and its comments?
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={onDelete}
                    disabled={busy}
                  >
                    Yes, delete it
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Keep it
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
