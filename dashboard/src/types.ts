// Shared data types for the dashboard. A `null` value always means "取得不可"
// (could not be determined from the files) — never a guessed default.

export const PHASES = ["initialization", "ideation", "inception", "construction", "operation"] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  initialization: "Initialization",
  ideation: "Ideation",
  inception: "Inception",
  construction: "Construction",
  operation: "Operation",
};

/** Raw entry of `aidlc/spaces/<space>/intents/intents.json`. */
export interface IntentRegistryEntry {
  space: string;
  uuid: string | null;
  slug: string | null;
  dirName: string | null;
  scope: string | null;
  /** "in-flight" | "complete" in current engine versions; kept verbatim. */
  status: string | null;
}

/** Checkbox marks used in `aidlc-state.md` Stage Progress. */
export type StageMark = " " | "-" | "?" | "R" | "x" | "S";

export interface StageLine {
  slug: string;
  mark: StageMark;
  /** true for `— EXECUTE`, false for `— SKIP`. */
  execute: boolean;
  phase: Phase;
}

export interface ParsedState {
  /** `- **Key**: value` fields. Empty values are omitted. First occurrence wins. */
  fields: Record<string, string>;
  stages: StageLine[];
}

export interface AuditEvent {
  title: string;
  /** ISO string as written in the file. */
  timestamp: string;
  /** Epoch milliseconds of `timestamp`. */
  time: number;
  event: string;
  /** All `**Field**: value` lines, including Timestamp and Event. */
  fields: Record<string, string>;
  /** Shard file name the event came from. */
  shard: string;
  /** Position of the event inside its shard (0-based). */
  index: number;
}

export type IntentStatus =
  | "complete"
  | "parked"
  | "blocked-failed"
  | "blocked-questions"
  | "awaiting-approval"
  | "blocked-idle"
  | "ai-working"
  | "unavailable";

/** Who currently holds the ball. */
export type Ball = "human" | "ai" | "none" | "unknown";

export interface PhaseProgress {
  phase: Phase;
  label: string;
  /** Number of `— EXECUTE` stages in the phase. */
  total: number;
  /** Number of `— EXECUTE` stages marked `[x]`. */
  done: number;
  /** false when the phase has no EXECUTE stage ("対象外"). */
  applicable: boolean;
}

export interface IntentView {
  /** Stable id: `<space>/<dirName or slug>`. */
  id: string;
  space: string;
  slug: string | null;
  dirName: string | null;
  scope: string | null;
  status: IntentStatus;
  statusLabel: string;
  ball: Ball;
  /** Phase of the current stage (from the stage list, falling back to Lifecycle Phase). */
  phase: Phase | null;
  currentStage: string | null;
  activeAgent: string | null;
  /** Newer of `Last Updated` and the latest audit event (ISO). */
  lastUpdated: string | null;
  owner: string;
  /** null when the state file could not be read. */
  progress: PhaseProgress[] | null;
  /** Start of the current wait (ISO), only for human-ball states. null = 取得不可 or not waiting. */
  waitingSince: string | null;
  /** One-line "what to look at" text (FR-014); null when not a human-ball state. */
  headline: string | null;
  /** Ideation/Inception approval → "影響大". */
  highImpact: boolean;
  unansweredQuestions: number | null;
  /** Why the status or some fields could not be determined (FR-008). */
  unavailableReasons: string[];
}

export interface Summary {
  awaitingApproval: number;
  blocked: number;
  aiWorking: number;
  complete: number;
  parked: number;
  unavailable: number;
}

export interface DashboardPayload {
  generatedAt: string;
  updateMode: "watch" | "poll";
  summary: Summary;
  attention: IntentView[];
  intents: IntentView[];
}
