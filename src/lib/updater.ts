/**
 * In-app updater: thin shim around `@tauri-apps/plugin-updater`.
 *
 * Why a Zustand store rather than React state in the component:
 *  - The startup check runs from App.tsx; the optional "Install" UI lives in
 *    StatusBar. Sharing a store keeps the two decoupled and lets any future
 *    surface (settings page, command palette) read the same state.
 *  - Update downloads can take a while; we want progress to survive route
 *    transitions and component remounts.
 *
 * Web/browser fallback: `isTauriRuntime()` (already used by the data-source
 * factory) keeps every call a no-op so `pnpm dev` outside Tauri is silent.
 */

import { create } from "zustand";

import { isTauriRuntime } from "@/datasource/factory";

export type UpdaterPhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "uptodate"
  | "error";

export interface UpdaterState {
  phase: UpdaterPhase;
  availableVersion: string | null;
  /** Total bytes the updater has reported; null until the first event. */
  totalBytes: number | null;
  /** Bytes downloaded so far. */
  downloadedBytes: number;
  /** Last error message (only meaningful when phase === "error"). */
  error: string | null;
  /** Notes from the manifest, if the publisher set them. */
  notes: string | null;

  /** Check the configured endpoint; quietly returns on web/dev. */
  checkForUpdate: (opts?: { silent?: boolean }) => Promise<void>;
  /** Kick off download + install + relaunch. Safe to call only after
   *  `phase === "available"`. */
  installAndRestart: () => Promise<void>;
  /** Clear the popup without disabling the next check. */
  dismiss: () => void;
}

export const useUpdater = create<UpdaterState>((set, get) => ({
  phase: "idle",
  availableVersion: null,
  totalBytes: null,
  downloadedBytes: 0,
  error: null,
  notes: null,

  async checkForUpdate(opts) {
    if (!isTauriRuntime()) return;
    if (get().phase === "checking" || get().phase === "downloading") return;
    set({ phase: "checking", error: null });
    try {
      // Imported lazily so the browser build doesn't try to resolve the
      // Tauri-only module at startup.
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        set({
          phase: "uptodate",
          availableVersion: null,
          notes: null,
        });
        return;
      }
      set({
        phase: "available",
        availableVersion: update.version,
        notes: update.body ?? null,
        totalBytes: null,
        downloadedBytes: 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A startup check failing is noise — most of the time the user just
      // isn't online or the endpoint isn't published yet. `silent` keeps the
      // "ready" status bar clean; explicit clicks still surface the error.
      if (opts?.silent) {
        set({ phase: "idle", error: null });
      } else {
        set({ phase: "error", error: message });
      }
    }
  },

  async installAndRestart() {
    if (!isTauriRuntime()) return;
    if (get().phase !== "available") return;
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        set({ phase: "uptodate" });
        return;
      }
      set({ phase: "downloading", totalBytes: null, downloadedBytes: 0 });
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            set({
              phase: "downloading",
              totalBytes: event.data.contentLength ?? null,
              downloadedBytes: 0,
            });
            break;
          case "Progress":
            set((s) => ({
              downloadedBytes: s.downloadedBytes + event.data.chunkLength,
            }));
            break;
          case "Finished":
            set({ phase: "installing" });
            break;
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ phase: "error", error: message });
    }
  },

  dismiss() {
    set((s) =>
      s.phase === "available" || s.phase === "uptodate" || s.phase === "error"
        ? { ...s, phase: "idle" }
        : s,
    );
  },
}));
