import { describe, expect, test } from "bun:test";
import { parseState } from "../../src/parse/state.ts";

const REAL_LIKE = `# AI-DLC State Tracking

## Project Information
- **Project**: 依頼: ダッシュボード
- **Scope**: poc
- **Active Agent**: aidlc-developer-agent
- **Worktree Path**:

## Phase Progress
- **Initialization**: Active
- **Ideation**: Pending

## Stage Progress
<!-- Checkbox states: [ ] not started, [-] in progress -->

### INITIALIZATION PHASE
- [x] workspace-scaffold — EXECUTE
- [x] state-init — EXECUTE

### IDEATION PHASE
- [x] intent-capture — EXECUTE
- [ ] market-research — SKIP

### CONSTRUCTION PHASE
Per unit: [TBD]
- [ ] functional-design — SKIP
- [-] code-generation — EXECUTE
- [ ] build-and-test — EXECUTE

### OPERATION PHASE
- [ ] deployment-pipeline — SKIP

## Current Status
- **Lifecycle Phase**: CONSTRUCTION
- **Current Stage**: code-generation
- **Status**: Running
- **Last Updated**: 2026-10-11T05:07:27Z
`;

describe("parseState", () => {
  test("reads fields and stage lines with phase headings", () => {
    const s = parseState(REAL_LIKE);
    expect(s.fields["Current Stage"]).toBe("code-generation");
    expect(s.fields["Lifecycle Phase"]).toBe("CONSTRUCTION");
    expect(s.fields["Active Agent"]).toBe("aidlc-developer-agent");
    expect(s.fields["Last Updated"]).toBe("2026-10-11T05:07:27Z");
    expect(s.stages).toHaveLength(8);
    expect(s.stages.find((x) => x.slug === "code-generation")).toEqual({
      slug: "code-generation",
      mark: "-",
      execute: true,
      phase: "construction",
    });
    expect(s.stages.find((x) => x.slug === "market-research")).toMatchObject({ execute: false, phase: "ideation" });
  });

  test("empty field values are treated as missing", () => {
    expect("Worktree Path" in parseState(REAL_LIKE).fields).toBe(false);
  });

  test("the stale Phase Progress section does not produce stage lines", () => {
    const s = parseState(REAL_LIKE);
    expect(s.stages.some((x) => x.slug === "initialization")).toBe(false);
  });

  test("recognises every checkbox mark", () => {
    const marks = [" ", "-", "?", "R", "x", "S"];
    const text = `### INCEPTION PHASE\n` + marks.map((m, i) => `- [${m}] stage-${i} — EXECUTE`).join("\n");
    expect(parseState(text).stages.map((s) => s.mark)).toEqual(marks as never);
  });

  test("missing Current Stage stays missing", () => {
    const s = parseState(REAL_LIKE.replace(/- \*\*Current Stage\*\*.*\n/, ""));
    expect(s.fields["Current Stage"]).toBeUndefined();
  });

  test("empty or garbage files yield empty results", () => {
    expect(parseState("")).toEqual({ fields: {}, stages: [] });
    expect(parseState("\u0000\u0001 not markdown at all")).toEqual({ fields: {}, stages: [] });
  });

  test("stage lines outside a known phase heading are ignored", () => {
    expect(parseState("### WEIRD PHASE\n- [x] a — EXECUTE\n").stages).toEqual([]);
  });
});
