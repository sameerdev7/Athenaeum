import { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { Button, ErrorNote, Field, Input } from "../components/ui";
import { forgotPassword } from "../api/users";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Enter the email you registered with.");
      return;
    }
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Lost Your Key?"
      subtitle="We'll send a link to choose a new password."
      footer={
        <Link to="/login" className="font-semibold text-terracotta hover:opacity-80">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-lg border border-verdigris bg-verdigris-soft px-4 py-3 text-uitext text-verdigris">
          If <strong>{email}</strong> is registered, a reset link is on its way.
          It works once and expires in 30 minutes. Check your spam folder too.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <ErrorNote error={error} />
          <Field label="Email" id="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy} className="mt-1 w-full">
            {busy ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
