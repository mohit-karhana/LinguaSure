import { GoogleLogin } from "@react-oauth/google";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Login({ googleClientId }: { googleClientId: string }) {
  const { user, login, loginWithPassword, signup } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        await signup(name, email, password);
      } else {
        await loginWithPassword(email, password);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not continue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="stage">
      <p className="eyebrow">LinguaSure</p>
      <h1>Know where you stand.</h1>
      <p className="lede">
        Create an account or sign in to measure how you communicate, then retry
        the same situation and see if the score moved.
      </p>

      <section className="login-box" aria-label="Account">
        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "signin" ? "active" : ""}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => setMode("signup")}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={(event) => void onSubmit(event)}>
          {mode === "signup" ? (
            <label>
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </label>
          ) : null}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </label>
          {mode === "signup" ? (
            <p className="hint">At least 8 characters.</p>
          ) : null}
          <button type="submit" className="primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <div className="auth-split">or</div>

        <h2>Continue with Google</h2>
        {googleClientId ? (
          <div className="google-btn">
            <GoogleLogin
              onSuccess={async (response) => {
                if (!response.credential) {
                  setError("Google did not return a sign-in credential.");
                  return;
                }
                try {
                  await login(response.credential);
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Sign-in failed.");
                }
              }}
              onError={() => setError("Google sign-in was cancelled.")}
              theme="filled_black"
              shape="pill"
              size="large"
              text="continue_with"
              width={320}
              use_fedcm_for_prompt
            />
          </div>
        ) : (
          <p className="empty">Google sign-in is optional. Use email and password above.</p>
        )}
        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
