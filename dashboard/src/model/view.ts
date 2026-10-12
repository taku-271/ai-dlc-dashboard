import {
  PHASES,
  PHASE_LABELS,
  type DashboardPayload,
  type IntentStatus,
  type IntentView,
  type ParsedState,
  type PhaseProgress,
  type Summary,
} from "../types.ts";
import { determineStatus, type IntentInput } from "./status.ts";

/** v1 has a single user; every intent belongs to "あなた" (FR-020). */
export const DEFAULT_OWNER = "あなた";

export const STATUS_LABELS: Record<IntentStatus, string> = {
  complete: "完了",
  parked: "一時停止",
  "blocked-failed": "ブロック（失敗で停止）",
  "blocked-questions": "ブロック（未回答の質問）",
  "awaiting-approval": "承認待ち",
  "blocked-idle": "ブロック（放置）",
  "ai-working": "AI 作業中",
  unavailable: "取得不可",
};

const BLOCKED: ReadonlySet<IntentStatus> = new Set(["blocked-failed", "blocked-questions", "blocked-idle"]);

export function isBlocked(status: IntentStatus): boolean {
  return BLOCKED.has(status);
}

/** Per-phase progress: denominator = EXECUTE stages, numerator = EXECUTE stages marked [x]. */
export function phaseProgress(state: ParsedState): PhaseProgress[] {
  return PHASES.map((phase) => {
    const exec = state.stages.filter((s) => s.phase === phase && s.execute);
    return {
      phase,
      label: PHASE_LABELS[phase],
      total: exec.length,
      done: exec.filter((s) => s.mark === "x").length,
      applicable: exec.length > 0,
    };
  });
}

/** "2時間 15分" style. Negative or sub-minute durations render as "1分未満". */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "1分未満";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}日 ${hours}時間` : `${days}日`;
  if (hours > 0) return mins > 0 ? `${hours}時間 ${mins}分` : `${hours}時間`;
  return `${mins}分`;
}

function latestIso(a: string | null, b: string | null): string | null {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  if (Number.isNaN(ta)) return Number.isNaN(tb) ? null : b;
  if (Number.isNaN(tb)) return a;
  return tb > ta ? b : a;
}

/** Builds the card/list model for one intent. `now` only affects duration text. */
export function buildIntentView(input: IntentInput, now: Date, owner = DEFAULT_OWNER): IntentView {
  const st = determineStatus(input);
  const { entry, state, events } = input;
  const reasons = [...st.reasons];
  if (input.stateProblem && !reasons.includes(input.stateProblem)) reasons.push(input.stateProblem);
  if (input.auditProblem && !reasons.includes(input.auditProblem)) reasons.push(input.auditProblem);
  if (input.questionsProblem && !reasons.includes(input.questionsProblem)) reasons.push(input.questionsProblem);
  for (const w of input.warnings ?? []) reasons.push(w);

  let headline: string | null = null;
  const stage = st.currentStage ?? "現在ステージ";
  switch (st.status) {
    case "awaiting-approval": {
      const n = input.stageArtifactCount;
      headline = `${stage} の承認（成果物${n === null ? " 取得不可" : `${n}件`}）`;
      break;
    }
    case "blocked-questions":
      headline = `未回答の質問 ${input.unansweredQuestions}件`;
      break;
    case "blocked-failed": {
      const f = st.failure;
      const detail = f?.fields["Error summary"] ?? f?.fields.Reason ?? "理由は取得不可";
      headline = `失敗で停止: ${detail}`;
      break;
    }
    case "blocked-idle":
      headline = st.waitingSince
        ? `セッション終了から ${formatDuration(now.getTime() - Date.parse(st.waitingSince))} 放置`
        : "セッション終了から 取得不可 放置";
      break;
  }

  const lastEvent = events && events.length > 0 ? events[events.length - 1]!.timestamp : null;
  const id = `${entry.space}/${entry.dirName ?? entry.slug ?? entry.uuid ?? "unknown"}`;

  return {
    id,
    space: entry.space,
    slug: entry.slug,
    dirName: entry.dirName,
    scope: entry.scope ?? state?.fields.Scope ?? null,
    status: st.status,
    statusLabel: STATUS_LABELS[st.status],
    ball: st.ball,
    phase: st.phase,
    currentStage: st.currentStage,
    activeAgent: state?.fields["Active Agent"] ?? null,
    lastUpdated: latestIso(state?.fields["Last Updated"] ?? null, lastEvent),
    owner,
    progress: state ? phaseProgress(state) : null,
    waitingSince: st.ball === "human" ? st.waitingSince : null,
    headline,
    highImpact: st.status === "awaiting-approval" && (st.phase === "ideation" || st.phase === "inception"),
    unansweredQuestions: input.unansweredQuestions,
    unavailableReasons: reasons,
  };
}

export function summarize(views: IntentView[]): Summary {
  const s: Summary = { awaitingApproval: 0, blocked: 0, aiWorking: 0, complete: 0, parked: 0, unavailable: 0 };
  for (const v of views) {
    if (v.status === "awaiting-approval") s.awaitingApproval++;
    else if (isBlocked(v.status)) s.blocked++;
    else if (v.status === "ai-working") s.aiWorking++;
    else if (v.status === "complete") s.complete++;
    else if (v.status === "parked") s.parked++;
    else s.unavailable++;
  }
  return s;
}

/** 0 = blocked, 1 = Ideation/Inception approval, 2 = later approval (FR-012). */
function impactRank(v: IntentView): number {
  if (isBlocked(v.status)) return 0;
  return v.highImpact ? 1 : 2;
}

export interface AttentionFilter {
  /** Only intents of this owner; undefined = everyone (FR-021). */
  owner?: string;
}

/** "今あなたが見るべきもの": human-ball intents sorted by impact, then longest wait. */
export function attentionList(views: IntentView[], filter: AttentionFilter = { owner: DEFAULT_OWNER }): IntentView[] {
  const waitKey = (v: IntentView) => (v.waitingSince ? Date.parse(v.waitingSince) : Number.POSITIVE_INFINITY);
  return views
    .filter((v) => v.ball === "human" && (filter.owner === undefined || v.owner === filter.owner))
    .sort(
      (a, b) =>
        impactRank(a) - impactRank(b) ||
        waitKey(a) - waitKey(b) ||
        (a.slug ?? "").localeCompare(b.slug ?? ""),
    );
}

export function buildPayload(views: IntentView[], updateMode: "watch" | "poll", now: Date): DashboardPayload {
  return {
    generatedAt: now.toISOString(),
    updateMode,
    summary: summarize(views),
    attention: attentionList(views),
    intents: views,
  };
}
