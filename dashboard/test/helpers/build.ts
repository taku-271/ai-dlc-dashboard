// Test helpers: build IntentInput values from compact descriptions.
import { mergeShards, parseAuditShard } from "../../src/parse/audit.ts";
import { parseState } from "../../src/parse/state.ts";
import type { IntentInput } from "../../src/model/status.ts";
import type { AuditEvent } from "../../src/types.ts";

export function events(list: [string, string, Record<string, string>?][], shard = "vm.md"): AuditEvent[] {
  const text = list
    .map(([t, e, f]) => `## ${e}\n**Timestamp**: ${t}\n**Event**: ${e}\n${Object.entries(f ?? {}).map(([k, v]) => `**${k}**: ${v}\n`).join("")}---`)
    .join("\n");
  return mergeShards([{ name: shard, events: parseAuditShard(text, shard).events }]);
}

export function stateText(current: string | null, mark: string, opts: { lifecycle?: string } = {}): string {
  const m = (slug: string) => (slug === current ? mark : " ");
  return `## Stage Progress
### INITIALIZATION PHASE
- [x] workspace-scaffold — EXECUTE
### IDEATION PHASE
- [${current === "intent-capture" ? mark : "x"}] intent-capture — EXECUTE
- [ ] market-research — SKIP
### INCEPTION PHASE
- [${m("requirements-analysis")}] requirements-analysis — EXECUTE
### CONSTRUCTION PHASE
- [${m("code-generation")}] code-generation — EXECUTE
- [ ] build-and-test — EXECUTE
### OPERATION PHASE
- [ ] deployment-pipeline — SKIP

## Current Status
- **Lifecycle Phase**: ${opts.lifecycle ?? "INCEPTION"}
${current ? `- **Current Stage**: ${current}\n` : ""}- **Active Agent**: aidlc-product-agent
- **Last Updated**: 2026-10-11T01:00:00Z
`;
}

export function input(over: Partial<IntentInput> & { stateMd?: string | null } = {}): IntentInput {
  const { stateMd, ...rest } = over;
  const md = stateMd === undefined ? stateText("requirements-analysis", "-") : stateMd;
  return {
    entry: { space: "default", uuid: "u", slug: "demo", dirName: "261011-demo", scope: "mvp", status: "in-flight" },
    state: md === null ? null : parseState(md),
    events: events([["2026-10-11T00:00:00Z", "SESSION_RESUMED"]]),
    unansweredQuestions: 0,
    stageArtifactCount: 1,
    ...rest,
  };
}
