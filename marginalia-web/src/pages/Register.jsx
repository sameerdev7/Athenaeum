import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import AuthLayout from "../components/AuthLayout";
import { Button, ErrorNote, Field, Input } from "../components/ui";

// Register and login are separate steps, matching the backend: this does not
// log you in automatically.
export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    // noValidate: the design system's ErrorNote is the single error surface.
    // Uniqueness and email validity are the server's call.
    if (!form.username.trim() || !form.email.trim() || !form.password) {
      setError("Fill in your username, email and password.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/users", form, { auth: false });
      navigate("/login", { state: { registered: true } });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Register"
      subtitle="Open a card of your own in the catalogue."
      footer={
        <>
          Already registered?{" "}
          <Link to="/login" className="font-semibold text-terracotta hover:opacity-80">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ErrorNote error={error} />
        <Field label="Username" id="username">
          <Input
            id="username"
            autoComplete="username"
            required
            minLength={1}
            maxLength={50}
            value={form.username}
            onChange={set("username")}
          />
        </Field>
        <Field label="Email" id="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={set("email")}
          />
        </Field>
        <Field
          label="Password"
          id="password"
          hint="At least 8 characters."
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={set("password")}
          />
        </Field>
        <Button type="submit" disabled={busy} className="mt-1 w-full">
          {busy ? "Creating…" : "Create Account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
