import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { redirectInsecureLoopback } from "./lib/microphone";
import "./index.css";

if (!redirectInsecureLoopback()) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
