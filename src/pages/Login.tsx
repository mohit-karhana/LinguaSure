import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const VALUE_POINTS = [
  "Practice real interview, meeting, and client scenarios.",
  "Get a clear score with evidence from your own responses.",
  "Run targeted drills and retry the same situation to improve fast.",
];

const HIGHLIGHTS = [
  { value: "8 min", label: "First assessment" },
  { value: "2 min", label: "Focused drill" },
  { value: "24/7", label: "AI speaking coach" },
];

export default function Login({ googleClientId: _googleClientId }: { googleClientId: string }) {
  const { user, loginWithPassword, signup } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/app" replace />;

  function switchMode(nextMode: "signin" | "signup") {
    setMode(nextMode);
    setError(null);
  }

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
    <main className="stage wide auth-v3-page">
      <section className="auth-v3-shell">
        <header className="auth-v3-header">
          <div>
            <p className="eyebrow">LinguaSure</p>
            <h1>Build speaking confidence for interviews and meetings.</h1>
          </div>
          <Link className="auth-v3-back" to="/">
            Back to landing
          </Link>
        </header>

        <section className="auth-v3-grid">
          <aside className="auth-v3-spotlight">
            <p className="auth-v3-kicker">Why learners choose LinguaSure</p>
            <div className="auth-v3-stats" aria-label="Platform highlights">
              {HIGHLIGHTS.map((item) => (
                <article key={item.label} className="auth-v3-stat">
                  <p className="auth-v3-stat-value">{item.value}</p>
                  <p className="auth-v3-stat-label">{item.label}</p>
                </article>
              ))}
            </div>
            <ul className="auth-v3-points">
              {VALUE_POINTS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>

          <section className="auth-v3-card" aria-label="Account">
            <p className="auth-v3-card-kicker">{mode === "signup" ? "Create your account" : "Welcome back"}</p>
            <h2>{mode === "signup" ? "Start your coaching journey" : "Continue your practice plan"}</h2>
            <p className="auth-v3-card-copy">
              {mode === "signup"
                ? "Create your profile and get your first communication score in one session."
                : "Sign in to continue your program, drills, and progress tracking."}
            </p>

            <div className="auth-v3-segment">
              <button
                type="button"
                className={mode === "signin" ? "active" : ""}
                aria-pressed={mode === "signin"}
                onClick={() => switchMode("signin")}
              >
                Sign in
              </button>
              <button
                type="button"
                className={mode === "signup" ? "active" : ""}
                aria-pressed={mode === "signup"}
                onClick={() => switchMode("signup")}
              >
                Create account
              </button>
            </div>

            <form className="auth-v3-form" onSubmit={(event) => void onSubmit(event)}>
              {mode === "signup" ? (
                <label>
                  <span>Full name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    placeholder="Your full name"
                    required
                  />
                </label>
              ) : null}

              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label>
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={8}
                  placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                  required
                />
              </label>

              {mode === "signup" ? <p className="auth-v3-hint">Use at least 8 characters.</p> : null}

              <button type="submit" className="primary auth-v3-submit" disabled={busy}>
                {busy
                  ? "Please wait..."
                  : mode === "signup"
                    ? "Create account and start"
                    : "Sign in and continue"}
              </button>
            </form>

            {error ? <p className="error auth-v3-error">{error}</p> : null}

            <p className="auth-v3-switch">
              {mode === "signin" ? "New to LinguaSure?" : "Already have an account?"}{" "}
              <button
                type="button"
                className="auth-v3-switch-btn"
                onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin" ? "Create account" : "Sign in"}
              </button>
            </p>
          </section>
        </section>
      </section>
    </main>
  );
}
