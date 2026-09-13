import { GoogleOAuthProvider } from "@react-oauth/google";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./hooks/useAuth";
import { api } from "./lib/api";
import { redirectInsecureLoopback } from "./lib/microphone";
import "./index.css";

function Root() {
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    api
      .config()
      .then((config) => setClientId(config.googleClientId || ""))
      .catch(() => setClientId(""));
  }, []);

  if (clientId === null) {
    return (
      <main className="stage">
        <p className="empty">Starting LinguaSure…</p>
      </main>
    );
  }

  const tree = (
    <BrowserRouter>
      <AuthProvider>
        <App googleClientId={clientId} />
      </AuthProvider>
    </BrowserRouter>
  );

  return clientId ? <GoogleOAuthProvider clientId={clientId}>{tree}</GoogleOAuthProvider> : tree;
}

if (!redirectInsecureLoopback()) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}
