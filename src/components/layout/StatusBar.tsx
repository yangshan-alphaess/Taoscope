import { Download, Github, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { LocaleToggle } from "@/components/layout/LocaleToggle";
import { useUpdater } from "@/lib/updater";
import { useAppState } from "@/store/appState";
import { openExternal } from "@/lib/openExternal";
import { cn } from "@/lib/utils";

const REPO_URL = "https://github.com/yangshan-alphaess/Taoscope";

// __APP_VERSION__ is injected by Vite (see vite.config.ts) at build time from
// package.json so a stale hard-coded value can't drift out of sync.
declare const __APP_VERSION__: string;
const APP_VERSION =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

export function StatusBar() {
  const { t } = useTranslation("common");
  const activeConsoleId = useAppState((s) => s.activeConsoleId);
  const runtime = useAppState((s) =>
    activeConsoleId ? s.consoleRuntime[activeConsoleId] : undefined,
  );

  // No active console -> "ready". With a runtime, follow its execStatus.
  const status = runtime?.execStatus ?? "idle";

  let leftLabel: string;
  switch (status) {
    case "idle":
      leftLabel = t("status.ready");
      break;
    case "running":
      leftLabel = t("status.running");
      break;
    case "ok":
      leftLabel = t("status.ok");
      break;
    case "error":
      leftLabel = `${t("status.error")}: ${runtime?.execError ?? "unknown"}`;
      break;
  }

  const showStats = status === "ok" && runtime?.lastResult != null;
  // Idle no longer renders a "ready" label; only transient states surface.
  const statusLabel = status === "idle" ? null : leftLabel;

  return (
    <footer className="text-muted-foreground flex h-6 shrink-0 items-center justify-between px-3 text-xs">
      <div className="flex items-center gap-2 font-mono">
        <UpdaterStatus />
        <span className="text-muted-foreground/40">·</span>
        <GithubLink />
        <span className="text-muted-foreground/40">·</span>
        <LocaleToggle />
      </div>
      <div className="flex min-w-0 items-center gap-2 font-mono">
        {statusLabel && (
          <>
            <span className="truncate">{statusLabel}</span>
            <span className="text-muted-foreground/40">·</span>
          </>
        )}
        <span className="whitespace-nowrap">
          {showStats
            ? `${runtime!.lastResult!.rowCount} ${t("unit.rows")}`
            : `— ${t("unit.rows")}`}
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="whitespace-nowrap">
          {showStats
            ? `${runtime!.lastResult!.elapsedMs} ${t("unit.ms")}`
            : `— ${t("unit.ms")}`}
        </span>
      </div>
    </footer>
  );
}

function GithubLink() {
  const { t } = useTranslation("common");
  return (
    <button
      type="button"
      onClick={() => {
        openExternal(REPO_URL).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(t("github.open-failed", { error: msg }));
        });
      }}
      title={t("github.tooltip")}
      aria-label={t("github.tooltip")}
      className="hover:bg-muted/50 hover:text-foreground inline-flex items-center justify-center rounded-sm p-1"
    >
      <Github className="h-3.5 w-3.5" />
    </button>
  );
}

function UpdaterStatus() {
  const { t } = useTranslation("updater");
  const {
    phase,
    availableVersion,
    totalBytes,
    downloadedBytes,
    error,
    checkForUpdate,
    installAndRestart,
  } = useUpdater();

  function onClick() {
    switch (phase) {
      case "available":
        void installAndRestart();
        break;
      case "downloading":
      case "installing":
      case "checking":
        // No-op while busy.
        break;
      default:
        // Manual recheck — surface result loud so the user gets feedback even
        // when already up to date.
        void checkForUpdate().then(() => {
          const next = useUpdater.getState();
          if (next.phase === "uptodate") {
            toast.success(t("toast.up-to-date", { version: APP_VERSION }));
          } else if (next.phase === "error" && next.error) {
            toast.error(t("toast.check-failed", { error: next.error }));
          }
        });
    }
  }

  let label: React.ReactNode;
  let title: string;
  switch (phase) {
    case "checking":
      label = (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{t("phase.checking")}</span>
        </>
      );
      title = t("tooltip.checking");
      break;
    case "available":
      label = (
        <>
          <Download className="h-3 w-3" />
          <span>{t("phase.available", { version: availableVersion })}</span>
        </>
      );
      title = t("tooltip.available", { version: availableVersion });
      break;
    case "downloading": {
      const pct =
        totalBytes && totalBytes > 0
          ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
          : null;
      label = (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>
            {pct !== null
              ? t("phase.downloading-percent", { pct })
              : `${t("phase.downloading")}…`}
          </span>
        </>
      );
      title = t("tooltip.downloading");
      break;
    }
    case "installing":
      label = (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{t("phase.installing")}</span>
        </>
      );
      title = t("tooltip.installing");
      break;
    case "error":
      label = (
        <>
          <RefreshCw className="h-3 w-3" />
          <span>{t("phase.retry", { version: APP_VERSION })}</span>
        </>
      );
      title = error ?? t("tooltip.error-default");
      break;
    case "uptodate":
    case "idle":
    default:
      label = <span>{t("phase.version", { version: APP_VERSION })}</span>;
      title = t("tooltip.idle");
      break;
  }

  const interactive = phase !== "downloading" && phase !== "installing";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5",
        interactive
          ? "hover:bg-muted/50 hover:text-foreground"
          : "cursor-default",
        phase === "available" && "text-primary hover:text-primary",
      )}
    >
      {label}
    </button>
  );
}
