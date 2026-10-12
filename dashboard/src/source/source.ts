import type { IntentView } from "../types.ts";

export type UpdateMode = "watch" | "poll";

export interface WatchHandle {
  /** "watch" = native file watching, "poll" = 2s polling fallback (FR-031). */
  readonly mode: UpdateMode;
  close(): void;
}

/**
 * The single data-access seam (NFR-007). The UI and server only depend on this,
 * so a future git-backed multi-user source can replace LocalFsSource.
 */
export interface IntentSource {
  listIntents(now?: Date): Promise<IntentView[]>;
  watch(onChange: () => void): WatchHandle;
}
