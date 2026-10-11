import { describe, expect, test } from "bun:test";
import { attentionList, buildIntentView, formatDuration, phaseProgress, summarize } from "../../src/model/view.ts";
import { parseState } from "../../src/parse/state.ts";
import type { IntentView } from "../../src/types.ts";
import { events, input, stateText } from "../helpers/build.ts";

const NOW = new Date("2026-10-11T05:00:00Z");

describe("phaseProgress", () => {
  test("EXECUTE stages are the denominator, [x] the numerator, 0 → 対象外", () => {
    const p = phaseProgress(parseState(stateText("code-generation", "-")));
    expect(p.map((x) => [x.phase, x.done, x.total, x.applicable])).toEqual([
      ["initialization", 1, 1, true],
      ["ideation", 1, 1, true],
      ["inception", 0, 1, true],
      ["construction", 0, 2, true],
      ["operation", 0, 0, false],
    ]);
  });
});

describe("formatDuration", () => {
  test("formats minutes, hours and days", () => {
    expect(formatDuration(30_000)).toBe("1分未満");
    expect(formatDuration(-5)).toBe("1分未満");
    expect(formatDuration(5 * 60_000)).toBe("5分");
    expect(formatDuration(2 * 3600_000)).toBe("2時間");
    expect(formatDuration(2 * 3600_000 + 15 * 60_000)).toBe("2時間 15分");
    expect(formatDuration(26 * 3600_000)).toBe("1日 2時間");
  });
});

describe("buildIntentView headlines (FR-014)", () => {
  test("approval shows stage and artifact count, Inception is 影響大", () => {
    const v = buildIntentView(input({ stateMd: stateText("requirements-analysis", "?"), stageArtifactCount: 2 }), NOW);
    expect(v.headline).toBe("requirements-analysis の承認（成果物2件）");
    expect(v.highImpact).toBe(true);
  });

  test("Construction approval is not 影響大; unknown artifact count says 取得不可", () => {
    const v = buildIntentView(
      input({ stateMd: stateText("code-generation", "?", { lifecycle: "CONSTRUCTION" }), stageArtifactCount: null }),
      NOW,
    );
    expect(v.headline).toBe("code-generation の承認（成果物 取得不可）");
    expect(v.highImpact).toBe(false);
  });

  test("questions, failure and idle", () => {
    expect(buildIntentView(input({ unansweredQuestions: 3 }), NOW).headline).toBe("未回答の質問 3件");
    const failed = events([["2026-10-11T00:10:00Z", "SWARM_UNIT_FAILED", { Reason: "cap-exhausted" }]]);
    expect(buildIntentView(input({ events: failed }), NOW).headline).toBe("失敗で停止: cap-exhausted");
    const failedNoDetail = events([["2026-10-11T00:10:00Z", "BOLT_FAILED"]]);
    expect(buildIntentView(input({ events: failedNoDetail }), NOW).headline).toBe("失敗で停止: 理由は取得不可");
    const idle = events([["2026-10-11T03:00:00Z", "SESSION_ENDED"]]);
    expect(buildIntentView(input({ events: idle }), NOW).headline).toBe("セッション終了から 2時間 放置");
  });

  test("AI working has no headline or wait, and fields come from the state file", () => {
    const v = buildIntentView(input(), NOW);
    expect(v).toMatchObject({
      status: "ai-working",
      statusLabel: "AI 作業中",
      headline: null,
      waitingSince: null,
      owner: "あなた",
      activeAgent: "aidlc-product-agent",
      currentStage: "requirements-analysis",
    });
  });

  test("lastUpdated is the newer of Last Updated and the latest audit event", () => {
    expect(buildIntentView(input(), NOW).lastUpdated).toBe("2026-10-11T01:00:00Z");
    const later = events([["2026-10-11T04:00:00Z", "SESSION_RESUMED"]]);
    expect(buildIntentView(input({ events: later }), NOW).lastUpdated).toBe("2026-10-11T04:00:00Z");
  });

  test("unavailable intent keeps nulls and reasons", () => {
    const v = buildIntentView(input({ stateMd: null, stateProblem: "state がない" }), NOW);
    expect(v).toMatchObject({ status: "unavailable", progress: null, currentStage: null, activeAgent: null });
    expect(v.unavailableReasons).toEqual(["state がない"]);
  });

  test("non-fatal warnings are surfaced", () => {
    expect(buildIntentView(input({ warnings: ["audit/x.md の 1 件のブロックが読めない（無視）"] }), NOW).unavailableReasons).toHaveLength(1);
  });
});

function view(p: Partial<IntentView>): IntentView {
  return {
    id: p.slug ?? "x", space: "default", slug: "x", dirName: "d", scope: null, status: "ai-working", statusLabel: "", ball: "ai",
    phase: null, currentStage: null, activeAgent: null, lastUpdated: null, owner: "あなた", progress: null,
    waitingSince: null, headline: null, highImpact: false, unansweredQuestions: 0, unavailableReasons: [], ...p,
  };
}

describe("attentionList (FR-011..013, FR-021)", () => {
  const list = [
    view({ slug: "late-approval-old", status: "awaiting-approval", ball: "human", waitingSince: "2026-10-10T00:00:00Z" }),
    view({ slug: "early-approval", status: "awaiting-approval", ball: "human", highImpact: true, waitingSince: "2026-10-11T04:00:00Z" }),
    view({ slug: "questions-new", status: "blocked-questions", ball: "human", waitingSince: "2026-10-11T03:00:00Z" }),
    view({ slug: "idle-old", status: "blocked-idle", ball: "human", waitingSince: "2026-10-11T01:00:00Z" }),
    view({ slug: "failed-unknown-wait", status: "blocked-failed", ball: "human", waitingSince: null }),
    view({ slug: "ai", status: "ai-working", ball: "ai" }),
    view({ slug: "done", status: "complete", ball: "none" }),
    view({ slug: "someone-else", status: "blocked-idle", ball: "human", owner: "他の人", waitingSince: "2026-10-09T00:00:00Z" }),
  ];

  test("blocked first, then 影響大 approvals, then later approvals; longer wait first; unknown wait last in its rank", () => {
    expect(attentionList(list).map((v) => v.slug)).toEqual([
      "idle-old",
      "questions-new",
      "failed-unknown-wait",
      "early-approval",
      "late-approval-old",
    ]);
  });

  test("dropping the owner filter shows everyone", () => {
    expect(attentionList(list, {}).map((v) => v.slug)[0]).toBe("someone-else");
  });

  test("empty input", () => {
    expect(attentionList([])).toEqual([]);
  });
});

describe("summarize (FR-010)", () => {
  test("counts each bucket", () => {
    const s = summarize([
      view({ status: "awaiting-approval" }),
      view({ status: "blocked-failed" }),
      view({ status: "blocked-idle" }),
      view({ status: "ai-working" }),
      view({ status: "complete" }),
      view({ status: "parked" }),
      view({ status: "unavailable" }),
    ]);
    expect(s).toEqual({ awaitingApproval: 1, blocked: 2, aiWorking: 1, complete: 1, parked: 1, unavailable: 1 });
  });
});
