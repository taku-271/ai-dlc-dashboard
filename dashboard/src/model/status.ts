import type { AuditEvent, Ball, IntentRegistryEntry, IntentStatus, ParsedState, Phase, StageLine } from "../types.ts";
import { PHASES } from "../types.ts";

/** Everything the model needs about one intent, already read from disk. */
export interface IntentInput {
  entry: IntentRegistryEntry;
  /** null when `aidlc-state.md` is missing or unreadable (see stateProblem). */
  state: ParsedState | null;
  stateProblem?: string;
  /** Merged, time-ordered events; null when no audit shard could be read. */
  events: AuditEvent[] | null;
  auditProblem?: string;
  /** Unanswered `[Answer]:` lines in the current stage's questions files; null = 取得不可. */
  unansweredQuestions: number | null;
  questionsProblem?: string;
  /** Artifact files of the current stage (for the approval headline); null = 取得不可. */
  stageArtifactCount: number | null;
  /** Non-fatal read problems (e.g. a malformed audit block that was skipped). */
  warnings?: string[];
}

export interface StatusResult {
  status: IntentStatus;
  ball: Ball;
  /** Event or reference time where the current human wait started. */
  waitingSince: string | null;
  /** The failure event for blocked-failed. */
  failure: AuditEvent | null;
  currentStage: string | null;
  currentLine: StageLine | null;
  phase: Phase | null;
  reasons: string[];
}

const FAILURE_EVENTS = new Set(["BOLT_FAILED", "SWARM_UNIT_FAILED"]);
const FAILURE_CLEARING = new Set(["STAGE_STARTED", "SESSION_RESUMED", "GATE_APPROVED"]);
const SESSION_EVENTS = new Set(["SESSION_STARTED", "SESSION_RESUMED", "SESSION_ENDED"]);

function lastIndex(events: AuditEvent[], pred: (e: AuditEvent) => boolean): number {
  for (let i = events.length - 1; i >= 0; i--) if (pred(events[i]!)) return i;
  return -1;
}

export function stateFile(entry: IntentRegistryEntry): string {
  return `aidlc/spaces/${entry.space}/intents/${entry.dirName ?? "?"}/aidlc-state.md`;
}

/** Applies FR-001..FR-008 in priority order. */
export function determineStatus(input: IntentInput): StatusResult {
  const { entry, state, events } = input;
  const reasons: string[] = [];

  const currentStage: string | null = state?.fields["Current Stage"] ?? null;
  const currentLine = currentStage ? (state?.stages.find((s) => s.slug === currentStage) ?? null) : null;
  const lifecycle = state?.fields["Lifecycle Phase"]?.toLowerCase() ?? null;
  const phase: Phase | null =
    currentLine?.phase ?? ((PHASES as readonly string[]).includes(lifecycle ?? "") ? (lifecycle as Phase) : null);

  const base = { failure: null, currentStage, currentLine, phase, waitingSince: null };
  const result = (status: IntentStatus, ball: Ball, extra: Partial<StatusResult> = {}): StatusResult => ({
    ...base,
    status,
    ball,
    reasons,
    ...extra,
  });

  // FR-001: complete
  if (entry.status === "complete") return result("complete", "none");
  if (events?.some((e) => e.event === "WORKFLOW_COMPLETED")) return result("complete", "none");

  if (!entry.dirName) {
    reasons.push(`intents.json の ${entry.slug ?? "(slug なし)"} に dirName 欄がない`);
    return result("unavailable", "unknown");
  }
  if (events === null) {
    reasons.push(input.auditProblem ?? `aidlc/spaces/${entry.space}/intents/${entry.dirName}/audit/ が読めない`);
    return result("unavailable", "unknown");
  }

  // FR-002: parked
  const parked = lastIndex(events, (e) => e.event === "WORKFLOW_PARKED");
  if (parked >= 0 && lastIndex(events, (e) => e.event === "WORKFLOW_UNPARKED") < parked) {
    return result("parked", "none");
  }

  // FR-003: failed and not resumed
  const failedAt = lastIndex(events, (e) => FAILURE_EVENTS.has(e.event));
  if (failedAt >= 0 && !events.slice(failedAt + 1).some((e) => FAILURE_CLEARING.has(e.event))) {
    const failure = events[failedAt]!;
    return result("blocked-failed", "human", { failure, waitingSince: failure.timestamp });
  }

  // Everything below needs the state file and the current stage.
  if (!state) {
    reasons.push(input.stateProblem ?? `${stateFile(entry)} が読めない`);
    return result("unavailable", "unknown");
  }
  if (!currentStage) {
    reasons.push(`${stateFile(entry)} に Current Stage 欄がない`);
    return result("unavailable", "unknown");
  }
  if (!currentLine) {
    reasons.push(`${stateFile(entry)} の Stage Progress に現在ステージ ${currentStage} の行がない`);
    return result("unavailable", "unknown");
  }

  const lastOf = (name: string, stage?: string) => {
    const i = lastIndex(events, (e) => e.event === name && (stage === undefined || e.fields.Stage === stage));
    return i >= 0 ? events[i]!.timestamp : null;
  };

  // FR-004: unanswered questions
  if (input.unansweredQuestions === null) {
    reasons.push(input.questionsProblem ?? `${currentStage} の質問票が読めない`);
    return result("unavailable", "unknown");
  }
  if (input.unansweredQuestions > 0) {
    return result("blocked-questions", "human", { waitingSince: lastOf("STAGE_STARTED", currentStage) });
  }

  // FR-005: awaiting approval
  if (currentLine.mark === "?") {
    return result("awaiting-approval", "human", {
      waitingSince: lastOf("STAGE_AWAITING_APPROVAL", currentStage),
    });
  }

  // FR-006: left idle mid-stage
  if (currentLine.mark === "-") {
    const s = lastIndex(events, (e) => SESSION_EVENTS.has(e.event));
    if (s >= 0 && events[s]!.event === "SESSION_ENDED") {
      return result("blocked-idle", "human", { waitingSince: events[s]!.timestamp });
    }
  }

  // FR-007: AI working
  if (currentLine.mark === "-" || currentLine.mark === "R" || currentLine.mark === "x") {
    return result("ai-working", "ai");
  }

  reasons.push(
    `${stateFile(entry)} の現在ステージ ${currentStage} のチェックボックスが [${currentLine.mark}] で、状態を判定できない`,
  );
  return result("unavailable", "unknown");
}
