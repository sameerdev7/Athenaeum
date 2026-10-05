import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { Button, ErrorNote, Field, Input } from "../components/ui";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const justRegistered = location.state?.registered;
  const justReset = location.state?.reset;

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    // noValidate: errors render through the design system's ErrorNote rather
    // than an unstyled browser bubble. The server stays the authority on
    // whether the credentials are right.
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      await login(email, password);
      navigate("/discover");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Sign In"
      subtitle="Pick up where your last bookmark ended."
      footer={
        <>
          No account yet?{" "}
          <Link to="/register" className="font-semibold text-terracotta hover:opacity-80">
            Register
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {justRegistered && (
          <p className="rounded-lg border border-verdigris bg-verdigris-soft px-3 py-2 text-uitext text-verdigris">
            Account created. Sign in to continue.
          </p>
        )}
        {justReset && (
          <p className="rounded-lg border border-verdigris bg-verdigris-soft px-3 py-2 text-uitext text-verdigris">
            Password updated. Sign in with your new one.
          </p>
        )}
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
        <Field label="Password" id="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Link
          to="/forgot-password"
          className="-mt-1 self-end text-caption font-semibold text-ink-soft hover:text-terracotta"
        >
          Forgot password?
        </Link>
        <Button type="submit" disabled={busy} className="mt-1 w-full">
          {busy ? "Signing in…" : "Sign In"}
        </Button>
      </form>
    </AuthLayout>
  );
}
