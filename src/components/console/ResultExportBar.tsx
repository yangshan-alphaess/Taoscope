import { useState, type ReactNode } from "react";
import { Copy, Download } from "lucide-react";

import type { QueryResult } from "@/datasource/types";
import { cn } from "@/lib/utils";
import {
  buildFilename,
  toCsv,
  toJson,
} from "@/components/console/resultExport";

type Feedback = "idle" | "success" | "fail";
type ButtonKey = "copyCsv" | "downloadCsv" | "copyJson" | "downloadJson";

const SUCCESS_LABEL: Record<ButtonKey, string> = {
  copyCsv: "Copied!",
  downloadCsv: "Downloaded!",
  copyJson: "Copied!",
  downloadJson: "Downloaded!",
};

const FORMAT_LABEL: Record<ButtonKey, string> = {
  copyCsv: "CSV",
  downloadCsv: "CSV",
  copyJson: "JSON",
  downloadJson: "JSON",
};

function downloadBlob(text: string, mime: string, filename: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ResultExportBar({ result }: { result: QueryResult }) {
  const [feedback, setFeedback] = useState<Record<ButtonKey, Feedback>>({
    copyCsv: "idle",
    downloadCsv: "idle",
    copyJson: "idle",
    downloadJson: "idle",
  });

  if (result.rows.length === 0) return null;

  function flash(key: ButtonKey, status: Feedback) {
    setFeedback((prev) => ({ ...prev, [key]: status }));
    window.setTimeout(() => {
      setFeedback((prev) => ({ ...prev, [key]: "idle" }));
    }, 1500);
  }

  async function handleCopy(key: ButtonKey, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(key, "success");
    } catch {
      flash(key, "fail");
    }
  }

  function handleDownload(
    key: ButtonKey,
    text: string,
    mime: string,
    filename: string,
  ) {
    try {
      downloadBlob(text, mime, filename);
      flash(key, "success");
    } catch {
      flash(key, "fail");
    }
  }

  function labelFor(key: ButtonKey): string {
    const state = feedback[key];
    if (state === "success") return SUCCESS_LABEL[key];
    if (state === "fail") return "Failed";
    return FORMAT_LABEL[key];
  }

  function renderButton(
    actionKey: ButtonKey,
    icon: ReactNode,
    onClick: () => void,
  ) {
    const state = feedback[actionKey];
    const busy = state !== "idle";
    return (
      <button
        type="button"
        disabled={busy}
        onClick={onClick}
        className={cn(
          "text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center gap-1 rounded-sm px-2 py-1 text-xs disabled:opacity-80",
          state === "success" && "text-emerald-600 dark:text-emerald-400",
          state === "fail" && "text-destructive",
        )}
      >
        {icon}
        <span>{labelFor(actionKey)}</span>
      </button>
    );
  }

  return (
    <div className="border-border bg-card/40 flex shrink-0 items-center gap-1 border-b px-2 py-1">
      {renderButton(
        "copyCsv",
        <Copy className="h-3 w-3" />,
        () => void handleCopy("copyCsv", toCsv(result)),
      )}
      {renderButton(
        "downloadCsv",
        <Download className="h-3 w-3" />,
        () =>
          handleDownload(
            "downloadCsv",
            toCsv(result),
            "text/csv;charset=utf-8",
            buildFilename("csv"),
          ),
      )}
      <span className="text-muted-foreground/40 px-1">·</span>
      {renderButton(
        "copyJson",
        <Copy className="h-3 w-3" />,
        () => void handleCopy("copyJson", toJson(result)),
      )}
      {renderButton(
        "downloadJson",
        <Download className="h-3 w-3" />,
        () =>
          handleDownload(
            "downloadJson",
            toJson(result),
            "application/json",
            buildFilename("json"),
          ),
      )}
      <span className="text-muted-foreground/60 ml-auto text-xs">
        {result.rowCount} rows ·{" "}
        {result.truncated ? "capped at 1000" : "all rows"}
      </span>
    </div>
  );
}
