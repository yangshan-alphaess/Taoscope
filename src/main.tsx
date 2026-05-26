import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { initI18n } from "@/lib/i18n";
import "@/index.css";

function Splash() {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="text-muted-foreground/60 text-xs">Loading…</div>
    </div>
  );
}

initI18n().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <React.Suspense fallback={<Splash />}>
        <App />
      </React.Suspense>
    </React.StrictMode>,
  );
});
