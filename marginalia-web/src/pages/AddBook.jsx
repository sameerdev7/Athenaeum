import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { invalidateCatalog } from "../api/catalog";
import { createBook, searchExternalBooks } from "../api/books";
import { Cover } from "../components/BookCard";
import PageHeader from "../components/PageHeader";
import { Button, ErrorNote, Field, Input, Select, Spinner, Textarea } from "../components/ui";

const BLANK = {
  title: "",
  author: "",
  genre: "",
  year: "",
  pages: "",
  description: "",
  cover_url: "",
};

const GENRES = [
  "Literary Fiction",
  "Science Fiction",
  "Fantasy",
  "Mystery & Thriller",
  "Historical Fiction",
  "Poetry",
  "Essays",
  "Memoir",
  "Philosophy",
  "Drama",
  "Non-fiction",
  "Other",
];

/**
 * Two independent halves on one page: a live Open Library search (left) that
 * only ever *prefills* the form (right), and the form itself, which is what
 * actually creates the book. Picking a search result never submits anything
 * by itself — genre and description always need a human, since Open Library
 * doesn't reliably supply either.
 */
export default function AddBook() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError("");
    setResults(null);
    try {
      setResults(await searchExternalBooks(q));
    } catch (err) {
      setSearchError(err.message);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  // Open Library reliably supplies title/author/year/cover/pages. Genre and
  // description are left to a human — it doesn't provide them without extra
  // calls, which is exactly what ARCHITECTURE.md says the form is for.
  function prefill(candidate) {
    setForm((f) => ({
      ...f,
      title: candidate.title ?? "",
      author: candidate.author ?? "",
      year: candidate.year ?? "",
      pages: candidate.pages ?? "",
      cover_url: candidate.cover_url ?? "",
    }));
  }

  function validate() {
    const next = {};
    if (!form.title.trim()) next.title = "Title is required.";
    if (!form.author.trim()) next.author = "Author is required.";
    if (!form.genre) next.genre = "Pick a genre.";
    const year = Number(form.year);
    if (!form.year || Number.isNaN(year)) next.year = "Year is required.";
    const pages = Number(form.pages);
    if (!form.pages || Number.isNaN(pages) || pages <= 0)
      next.pages = "Page count is required.";
    if (!form.description.trim()) next.description = "A description is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onCreate(e) {
    e.preventDefault();
    setSaveError("");
    if (!validate()) return;
    setBusy(true);
    try {
      const book = await createBook({
        title: form.title.trim(),
        author: form.author.trim(),
        genre: form.genre,
        year: Number(form.year),
        pages: Number(form.pages),
        description: form.description.trim(),
        cover_url: form.cover_url.trim() || null,
      });
      invalidateCatalog();
      navigate(`/books/${book.id}`);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title="Add a Book"
        subtitle="Search Open Library for a cover and the basics, then fill in what only a human knows."
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <h2 className="font-display text-cardtitle text-ink">
            Search the catalogue
          </h2>
          <form onSubmit={onSearch} className="mt-3 flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Title or author…"
              aria-label="Search Open Library"
            />
            <Button type="submit" disabled={searching} className="shrink-0">
              {searching ? "…" : "Search"}
            </Button>
          </form>

          <ErrorNote error={searchError} className="mt-3" />

          {searching && <Spinner />}

          {results && results.length === 0 && !searching && (
            <p className="mt-6 text-uitext italic text-ink-soft">
              Nothing found for “{query.trim()}”. Fill in the form by hand instead.
            </p>
          )}

          {results && results.length > 0 && (
            <ul className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-4">
              {results.map((r, i) => (
                <li key={`${r.title}-${i}`}>
                  <button
                    type="button"
                    onClick={() => prefill(r)}
                    className="group block w-full text-left"
                    title="Use this to prefill the form"
                  >
                    <Cover
                      book={r}
                      className="transition-opacity group-hover:opacity-80"
                    />
                    <span className="mt-2 block truncate text-caption font-semibold text-ink">
                      {r.title}
                    </span>
                    <span className="block truncate text-caption italic text-ink-soft">
                      {r.author ?? "Unknown"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <CardForm
          form={form}
          set={set}
          errors={errors}
          saveError={saveError}
          busy={busy}
          onCreate={onCreate}
        />
      </div>
    </div>
  );
}

function CardForm({ form, set, errors, saveError, busy, onCreate }) {
  return (
    <form
      onSubmit={onCreate}
      noValidate
      className="tablet-edge h-fit rounded bg-vellum-deep p-5 lg:sticky lg:top-24"
    >
      <h2 className="font-display text-cardtitle text-ink">Catalogue entry</h2>

      {form.cover_url && (
        <div className="mt-4 flex gap-3">
          <div className="w-20 shrink-0">
            <Cover book={form} />
          </div>
          <p className="self-center text-caption italic text-ink-soft">
            Cover from Open Library. Paste a different URL below to replace it.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-4">
        <ErrorNote error={saveError} />
        <Field label="Title" id="title" error={errors.title}>
          <Input id="title" value={form.title} onChange={set("title")} required />
        </Field>
        <Field label="Author" id="author" error={errors.author}>
          <Input id="author" value={form.author} onChange={set("author")} required />
        </Field>
        <Field label="Genre" id="genre" error={errors.genre}>
          <Select id="genre" value={form.genre} onChange={set("genre")} required>
            <option value="">Choose…</option>
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Year" id="year" error={errors.year}>
            <Input
              id="year"
              type="number"
              value={form.year}
              onChange={set("year")}
              required
            />
          </Field>
          <Field label="Pages" id="pages" error={errors.pages}>
            <Input
              id="pages"
              type="number"
              min="1"
              value={form.pages}
              onChange={set("pages")}
              required
            />
          </Field>
        </div>
        <Field
          label="Description"
          id="description"
          error={errors.description}
          hint="Up to 1000 characters."
        >
          <Textarea
            id="description"
            rows={4}
            maxLength={1000}
            value={form.description}
            onChange={set("description")}
            required
          />
        </Field>
        <Field
          label="Cover URL"
          id="cover_url"
          hint="Optional. Leave blank to render a plain title panel."
        >
          <Input
            id="cover_url"
            value={form.cover_url}
            onChange={set("cover_url")}
            placeholder="https://…"
          />
        </Field>
        <Button type="submit" disabled={busy} className="mt-1 w-full">
          {busy ? "Cataloguing…" : "Add to Catalogue"}
        </Button>
      </div>
    </form>
  );
}
