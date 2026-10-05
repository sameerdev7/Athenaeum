import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { Button, ErrorNote, Field, Input } from "../components/ui";
import { resetPassword } from "../api/users";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      navigate("/login", { state: { reset: true } });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout
        title="Link Incomplete"
        subtitle="This page needs the link from your email."
        footer={
          <Link to="/forgot-password" className="font-semibold text-terracotta hover:opacity-80">
            Request a new link
          </Link>
        }
      />
    );
  }

  return (
    <AuthLayout title="New Password" subtitle="Choose something you'll remember.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ErrorNote error={error} />
        <Field label="New password" id="password" hint="At least 8 characters.">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm password" id="confirm">
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy} className="mt-1 w-full">
          {busy ? "Saving…" : "Set new password"}
        </Button>
        {error.includes("expired") && (
          <Link to="/forgot-password" className="text-center text-uitext font-semibold text-terracotta">
            Request a new link
          </Link>
        )}
      </form>
    </AuthLayout>
  );
}
