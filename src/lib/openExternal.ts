import { isTauriRuntime } from "@/datasource/factory";

// Open a URL in the user's default browser. Under Tauri the webview must not
// navigate itself, so we hand off to the opener plugin; in the dev browser we
// fall back to a new tab.
export async function openExternal(url: string): Promise<void> {
  if (isTauriRuntime()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
