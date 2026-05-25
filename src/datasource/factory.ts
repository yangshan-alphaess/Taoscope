import type { DataSource } from "./types";
import { MockDataSource } from "./mock";
import { TauriDataSource } from "./tauri";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createDataSource(): DataSource {
  return isTauriRuntime() ? new TauriDataSource() : new MockDataSource();
}
