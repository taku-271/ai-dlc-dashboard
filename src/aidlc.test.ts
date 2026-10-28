import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseState, resolveIntent } from "./aidlc";

const STATE = `# AI-DLC State Tracking

## Project Information
- **Project**: レビューに職種を出す
- **Scope**: poc
- **Current Stage**: requirements-analysis

## Stage Progress
### IDEATION PHASE
- [x] intent-capture — EXECUTE
- [ ] market-research — SKIP
### INCEPTION PHASE
- [?] requirements-analysis — EXECUTE
- [-] user-stories — EXECUTE
- [R] application-design — EXECUTE
- [ ] code-generation — EXECUTE
`;

describe("parseState", () => {
  test("プロジェクト情報とステージの進み具合を読む", () => {
    expect(parseState(STATE)).toEqual({
      project: "レビューに職種を出す",
      scope: "poc",
      currentStage: "requirements-analysis",
      gateOpen: ["requirements-analysis"],
      revising: ["application-design"],
      inProgress: ["user-stories"],
      done: 1,
      total: 5,
    });
  });

  test("空のフィールドや空文書は undefined と 0 件", () => {
    const parsed = parseState("- **Current Stage**:\n- **Scope**: feature\n");
    expect(parsed.currentStage).toBeUndefined();
    expect(parsed.scope).toBe("feature");
    expect(parseState("")).toMatchObject({ total: 0, done: 0, gateOpen: [] });
  });
});

describe("resolveIntent", () => {
  const root = mkdtempSync(join(tmpdir(), "session-board-aidlc-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  function workspace(name: string, intents: { uuid: string; dirName: string }[]) {
    const cwd = join(root, name);
    const dir = join(cwd, "aidlc", "spaces", "default", "intents");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "intents.json"),
      JSON.stringify(intents.map(i => ({ ...i, slug: i.dirName.replace(/^\d+-/, ""), scope: "poc", status: "active" }))),
    );
    for (const i of intents) {
      mkdirSync(join(dir, i.dirName), { recursive: true });
      writeFileSync(join(dir, i.dirName, "aidlc-state.md"), STATE);
    }
    return { cwd, dir };
  }

  test("セッション記録があればそのインテントを使う", () => {
    const { cwd, dir } = workspace("stamped", [
      { uuid: "u-1", dirName: "261001-first" },
      { uuid: "u-2", dirName: "261002-second" },
    ]);
    writeFileSync(join(dir, "active-intent"), "261001-first\n");
    mkdirSync(join(cwd, "aidlc", ".aidlc-sessions"), { recursive: true });
    writeFileSync(join(cwd, "aidlc", ".aidlc-sessions", "cli-abc"), "u-2\n");

    expect(resolveIntent(cwd, "cli-abc")).toMatchObject({ slug: "second", dirName: "261002-second", source: "session" });
    // 記録のない別セッションはカーソルに従う
    expect(resolveIntent(cwd, "cli-other")).toMatchObject({ dirName: "261001-first", source: "cursor", gateOpen: ["requirements-analysis"] });
  });

  test("カーソルがなくインテントが 1 つだけならそれを使う", () => {
    const { cwd } = workspace("lone", [{ uuid: "u-9", dirName: "261009-only" }]);
    expect(resolveIntent(cwd)).toMatchObject({ dirName: "261009-only", source: "lone", status: "active" });
  });

  test("AI-DLC のないフォルダや、絞り込めないときは undefined", () => {
    expect(resolveIntent(join(root, "no-aidlc"))).toBeUndefined();
    const { cwd } = workspace("many", [
      { uuid: "a", dirName: "261001-a" },
      { uuid: "b", dirName: "261002-b" },
    ]);
    expect(resolveIntent(cwd)).toBeUndefined();
  });

  test("壊れた intents.json でも落ちずにカーソルから解決する", () => {
    const { cwd, dir } = workspace("broken", [{ uuid: "x", dirName: "261003-x" }]);
    writeFileSync(join(dir, "intents.json"), "{not json");
    writeFileSync(join(dir, "active-intent"), "261003-x\n");
    expect(resolveIntent(cwd)).toMatchObject({ dirName: "261003-x", slug: "261003-x", source: "cursor" });
  });
});
