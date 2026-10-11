import { describe, expect, test } from "bun:test";
import { determineStatus } from "../../src/model/status.ts";
import { events, input, stateText } from "../helpers/build.ts";

describe("determineStatus — each state", () => {
  test("FR-001 complete from registry status", () => {
    const r = determineStatus(input({ entry: { ...input().entry, status: "complete" } }));
    expect([r.status, r.ball]).toEqual(["complete", "none"]);
  });

  test("FR-001 complete from WORKFLOW_COMPLETED even without a state file", () => {
    const r = determineStatus(input({ stateMd: null, events: events([["2026-10-11T00:00:00Z", "WORKFLOW_COMPLETED"]]) }));
    expect(r.status).toBe("complete");
  });

  test("FR-002 parked until unparked", () => {
    const parked = events([["2026-10-11T00:00:00Z", "WORKFLOW_PARKED"]]);
    expect(determineStatus(input({ events: parked })).status).toBe("parked");
    const unparked = events([["2026-10-11T00:00:00Z", "WORKFLOW_PARKED"], ["2026-10-11T00:10:00Z", "WORKFLOW_UNPARKED"]]);
    expect(determineStatus(input({ events: unparked })).status).toBe("ai-working");
  });

  test("FR-003 failed until a clearing event", () => {
    const failed = events([
      ["2026-10-11T00:00:00Z", "SESSION_RESUMED"],
      ["2026-10-11T00:10:00Z", "BOLT_FAILED", { "Error summary": "boom" }],
      ["2026-10-11T00:11:00Z", "ERROR_LOGGED"],
    ]);
    const r = determineStatus(input({ events: failed }));
    expect([r.status, r.ball, r.waitingSince]).toEqual(["blocked-failed", "human", "2026-10-11T00:10:00Z"]);
    expect(r.failure?.fields["Error summary"]).toBe("boom");

    for (const clearing of ["STAGE_STARTED", "SESSION_RESUMED", "GATE_APPROVED"]) {
      const cleared = events([["2026-10-11T00:10:00Z", "SWARM_UNIT_FAILED"], ["2026-10-11T00:20:00Z", clearing]]);
      expect(determineStatus(input({ events: cleared })).status).toBe("ai-working");
    }
  });

  test("FR-004 unanswered questions, waiting since the current stage's STAGE_STARTED", () => {
    const ev = events([
      ["2026-10-11T00:00:00Z", "STAGE_STARTED", { Stage: "intent-capture" }],
      ["2026-10-11T01:00:00Z", "STAGE_STARTED", { Stage: "requirements-analysis" }],
    ]);
    const r = determineStatus(input({ events: ev, unansweredQuestions: 2 }));
    expect([r.status, r.ball, r.waitingSince]).toEqual(["blocked-questions", "human", "2026-10-11T01:00:00Z"]);
  });

  test("FR-005 awaiting approval on [?], waiting since STAGE_AWAITING_APPROVAL of the current stage", () => {
    const ev = events([
      ["2026-10-11T00:00:00Z", "STAGE_AWAITING_APPROVAL", { Stage: "intent-capture" }],
      ["2026-10-11T02:00:00Z", "STAGE_AWAITING_APPROVAL", { Stage: "requirements-analysis" }],
    ]);
    const r = determineStatus(input({ stateMd: stateText("requirements-analysis", "?"), events: ev }));
    expect([r.status, r.ball, r.waitingSince, r.phase]).toEqual(["awaiting-approval", "human", "2026-10-11T02:00:00Z", "inception"]);
  });

  test("FR-005 without a gate event: waitingSince is null (取得不可), not a guess", () => {
    const ev = events([["2026-10-11T00:00:00Z", "STAGE_AWAITING_APPROVAL", { Stage: "intent-capture" }]]);
    const r = determineStatus(input({ stateMd: stateText("requirements-analysis", "?"), events: ev }));
    expect(r.waitingSince).toBeNull();
  });

  test("FR-006 idle when [-] and the last session event is SESSION_ENDED", () => {
    const ev = events([
      ["2026-10-11T00:00:00Z", "SESSION_RESUMED"],
      ["2026-10-11T00:30:00Z", "SESSION_ENDED"],
      ["2026-10-11T00:31:00Z", "SUBAGENT_COMPLETED"],
    ]);
    const r = determineStatus(input({ events: ev }));
    expect([r.status, r.waitingSince]).toEqual(["blocked-idle", "2026-10-11T00:30:00Z"]);
  });

  test("FR-006 does not apply to [R] (AI is revising)", () => {
    const ev = events([["2026-10-11T00:30:00Z", "SESSION_ENDED"]]);
    expect(determineStatus(input({ stateMd: stateText("requirements-analysis", "R"), events: ev })).status).toBe("ai-working");
  });

  test("FR-007 ERROR_LOGGED alone is still AI working", () => {
    const ev = events([["2026-10-11T00:00:00Z", "SESSION_RESUMED"], ["2026-10-11T00:01:00Z", "ERROR_LOGGED", { Error: "x" }]]);
    const r = determineStatus(input({ events: ev }));
    expect([r.status, r.ball]).toEqual(["ai-working", "ai"]);
  });

  test("FR-007 current stage [x] before the next stage starts is AI working", () => {
    expect(determineStatus(input({ stateMd: stateText("requirements-analysis", "x") })).status).toBe("ai-working");
  });
});

describe("determineStatus — priority conflicts", () => {
  test("complete beats parked and failed", () => {
    const ev = events([["2026-10-11T00:00:00Z", "WORKFLOW_PARKED"], ["2026-10-11T00:01:00Z", "BOLT_FAILED"], ["2026-10-11T00:02:00Z", "WORKFLOW_COMPLETED"]]);
    expect(determineStatus(input({ events: ev })).status).toBe("complete");
  });

  test("parked beats failed", () => {
    const ev = events([["2026-10-11T00:01:00Z", "BOLT_FAILED"], ["2026-10-11T00:02:00Z", "WORKFLOW_PARKED"]]);
    expect(determineStatus(input({ events: ev })).status).toBe("parked");
  });

  test("failed beats unanswered questions and approval", () => {
    const ev = events([["2026-10-11T00:01:00Z", "BOLT_FAILED"]]);
    const r = determineStatus(input({ stateMd: stateText("requirements-analysis", "?"), events: ev, unansweredQuestions: 3 }));
    expect(r.status).toBe("blocked-failed");
  });

  test("unanswered questions beat approval and idle", () => {
    const ev = events([["2026-10-11T00:01:00Z", "SESSION_ENDED"]]);
    expect(determineStatus(input({ stateMd: stateText("requirements-analysis", "?"), events: ev, unansweredQuestions: 1 })).status).toBe("blocked-questions");
  });

  test("approval beats idle", () => {
    const ev = events([["2026-10-11T00:01:00Z", "SESSION_ENDED"]]);
    expect(determineStatus(input({ stateMd: stateText("requirements-analysis", "?"), events: ev })).status).toBe("awaiting-approval");
  });
});

describe("determineStatus — 取得不可 (FR-008)", () => {
  test("missing state file", () => {
    const r = determineStatus(input({ stateMd: null, stateProblem: "aidlc/.../aidlc-state.md がない" }));
    expect(r.status).toBe("unavailable");
    expect(r.reasons).toEqual(["aidlc/.../aidlc-state.md がない"]);
  });

  test("missing Current Stage field names the file and field", () => {
    const r = determineStatus(input({ stateMd: stateText(null, "-") }));
    expect(r.status).toBe("unavailable");
    expect(r.reasons[0]).toContain("Current Stage 欄がない");
    expect(r.reasons[0]).toContain("261011-demo/aidlc-state.md");
  });

  test("current stage without a checkbox line", () => {
    const md = stateText("requirements-analysis", "-").replace("- **Current Stage**: requirements-analysis", "- **Current Stage**: nope");
    const r = determineStatus(input({ stateMd: md }));
    expect(r.status).toBe("unavailable");
    expect(r.reasons[0]).toContain("nope");
  });

  test("no readable audit", () => {
    const r = determineStatus(input({ events: null, auditProblem: "audit/ がない" }));
    expect([r.status, r.ball, r.reasons[0]]).toEqual(["unavailable", "unknown", "audit/ がない"]);
  });

  test("questions file unreadable", () => {
    expect(determineStatus(input({ unansweredQuestions: null })).status).toBe("unavailable");
  });

  test("[ ] current stage is not guessed", () => {
    expect(determineStatus(input({ stateMd: stateText("requirements-analysis", " ") })).status).toBe("unavailable");
  });

  test("registry entry without dirName", () => {
    const r = determineStatus(input({ entry: { ...input().entry, dirName: null } }));
    expect(r.status).toBe("unavailable");
  });
});
