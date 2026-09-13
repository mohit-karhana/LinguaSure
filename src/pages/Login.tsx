import { GoogleLogin } from "@react-oauth/google";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Login({ googleClientId }: { googleClientId: string }) {
  const { user, login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  return (
    <main className="stage">
      <p className="eyebrow">LinguaSure</p>
      <h1>Know where you stand.</h1>
      <p className="lede">
        Sign in to measure how you communicate in interviews, standups, and
        client talks — then retry the same situation and see if the score moved.
      </p>

      <section className="login-box" aria-label="Sign in">
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
          <p className="empty">
            Add <code>GOOGLE_CLIENT_ID</code> to <code>.env</code>, then rebuild
            the server. In Google Cloud, create a Web OAuth client and add
            <code> http://localhost:3000 </code> as an authorized JavaScript origin.
          </p>
        )}
        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
