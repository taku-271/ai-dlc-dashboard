import { describe, expect, test } from "bun:test";
import { mergeShards, parseAuditShard } from "../../src/parse/audit.ts";

const SHARD = `# AI-DLC Audit Log

## Workflow Start
**Timestamp**: 2026-10-11T03:57:35Z
**Event**: WORKFLOW_STARTED
**Scope**: poc

---

## Stage Start
**Timestamp**: 2026-10-11T03:57:36Z
**Event**: STAGE_STARTED
**Stage**: workspace-scaffold
**Agent**: orchestrator

---

## Subagent Completed
**Timestamp**: 2026-10-11T04:17:38Z
**Event**: SUBAGENT_COMPLETED
**Agent Type**: 
**Message**: 承認

---
`;

describe("parseAuditShard", () => {
  test("parses blocks with title, timestamp, event and fields", () => {
    const { events, malformed } = parseAuditShard(SHARD, "vm-1.md");
    expect(malformed).toBe(0);
    expect(events.map((e) => e.event)).toEqual(["WORKFLOW_STARTED", "STAGE_STARTED", "SUBAGENT_COMPLETED"]);
    expect(events[1]).toMatchObject({
      title: "Stage Start",
      timestamp: "2026-10-11T03:57:36Z",
      shard: "vm-1.md",
      index: 1,
      fields: { Stage: "workspace-scaffold", Agent: "orchestrator" },
    });
    expect(events[2]!.fields["Agent Type"]).toBe("");
  });

  test("blocks without Timestamp/Event or with a bad time are counted as malformed", () => {
    const text = `## A\n**Event**: STAGE_STARTED\n---\n## B\n**Timestamp**: not-a-date\n**Event**: X\n---\n## C\n**Timestamp**: 2026-10-11T00:00:00Z\n**Event**: OK\n`;
    const r = parseAuditShard(text, "s.md");
    expect(r.malformed).toBe(2);
    expect(r.events.map((e) => e.event)).toEqual(["OK"]);
  });

  test("empty shard gives no events", () => {
    expect(parseAuditShard("", "s.md")).toEqual({ events: [], malformed: 0 });
  });

  test("truncated last block without separator still parses", () => {
    const r = parseAuditShard(`## X\n**Timestamp**: 2026-10-11T00:00:00Z\n**Event**: SESSION_ENDED`, "s.md");
    expect(r.events.map((e) => e.event)).toEqual(["SESSION_ENDED"]);
  });
});

describe("mergeShards (FR-009)", () => {
  const ev = (shard: string, list: [string, string][]) =>
    parseAuditShard(list.map(([t, e]) => `## ${e}\n**Timestamp**: ${t}\n**Event**: ${e}\n---`).join("\n"), shard).events;

  test("orders by time across shards", () => {
    const a = ev("a.md", [["2026-10-11T01:00:00Z", "A1"], ["2026-10-11T03:00:00Z", "A2"]]);
    const b = ev("b.md", [["2026-10-11T02:00:00Z", "B1"]]);
    expect(mergeShards([{ name: "b.md", events: b }, { name: "a.md", events: a }]).map((e) => e.event)).toEqual(["A1", "B1", "A2"]);
  });

  test("equal times keep in-shard order", () => {
    const a = ev("a.md", [["2026-10-11T01:00:00Z", "FIRST"], ["2026-10-11T01:00:00Z", "SECOND"], ["2026-10-11T01:00:00Z", "THIRD"]]);
    expect(mergeShards([{ name: "a.md", events: a }]).map((e) => e.event)).toEqual(["FIRST", "SECOND", "THIRD"]);
  });

  test("equal times across shards follow shard file-name order", () => {
    const a = ev("host-a.md", [["2026-10-11T01:00:00Z", "FROM_A"]]);
    const b = ev("host-b.md", [["2026-10-11T01:00:00Z", "FROM_B"]]);
    const merged = mergeShards([{ name: "host-b.md", events: b }, { name: "host-a.md", events: a }]);
    expect(merged.map((e) => e.event)).toEqual(["FROM_A", "FROM_B"]);
  });
});
