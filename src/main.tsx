import { GoogleOAuthProvider } from "@react-oauth/google";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./hooks/useAuth";
import { api } from "./lib/api";
import { initMetaPixel } from "./lib/analytics";
import { redirectInsecureLoopback } from "./lib/microphone";
import "./index.css";

function Root() {
  const [config, setConfig] = useState<{ googleClientId: string; metaPixelId: string } | null>(null);

  useEffect(() => {
    api
      .config()
      .then((next) => {
        initMetaPixel(next.metaPixelId);
        setConfig(next);
      })
      .catch(() => setConfig({ googleClientId: "", metaPixelId: "" }));
  }, []);

  if (config === null) {
    return (
      <main className="stage">
        <p className="empty">Starting LinguaSure…</p>
      </main>
    );
  }

  const tree = (
    <BrowserRouter>
      <AuthProvider>
        <App googleClientId={config.googleClientId} />
      </AuthProvider>
    </BrowserRouter>
  );

  return config.googleClientId ? (
    <GoogleOAuthProvider clientId={config.googleClientId}>{tree}</GoogleOAuthProvider>
  ) : (
    tree
  );
}

if (!redirectInsecureLoopback()) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}
