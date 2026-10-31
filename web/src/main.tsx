import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// Makes the app installable. Not in development, where it would get in the
// way of hot reloading.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
