import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTailLines, projectDirName, readTail, TranscriptLocator } from "./transcript";

const line = (entry: unknown) => JSON.stringify(entry);
const assistant = (stop_reason: string, content: unknown[]) => line({ type: "assistant", message: { stop_reason, content } });
const toolResult = line({ type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } });

describe("parseTailLines", () => {
  test("end_turn のテキスト応答で終わっていればターン終了", () => {
    expect(parseTailLines([toolResult, assistant("end_turn", [{ type: "text", text: "done" }])]).state).toBe("ended");
  });

  test("stop_hook_summary の後ろに付属行があってもターン終了", () => {
    const lines = [
      assistant("end_turn", [{ type: "text", text: "done" }]),
      line({ type: "system", subtype: "stop_hook_summary" }),
      line({ type: "file-history-snapshot" }),
    ];
    expect(parseTailLines(lines).state).toBe("ended");
  });

  test("ツール呼び出し中・ツール結果の直後は処理中", () => {
    expect(parseTailLines([assistant("tool_use", [{ type: "tool_use", name: "Bash" }])]).state).toBe("active");
    expect(parseTailLines([assistant("tool_use", [{ type: "tool_use", name: "Bash" }]), toolResult]).state).toBe("active");
  });

  test("回答前の AskUserQuestion は質問文つきで回答待ち", () => {
    const ask = assistant("tool_use", [
      { type: "tool_use", name: "AskUserQuestion", input: { questions: [{ question: "どちらで進めますか？" }] } },
    ]);
    expect(parseTailLines([ask])).toEqual({ state: "asking", question: "どちらで進めますか？" });
    // 回答済み（tool_result が続く）なら処理中に戻る
    expect(parseTailLines([ask, toolResult]).state).toBe("active");
  });

  test("ユーザーの中断で終わっていればターン終了", () => {
    const interrupted = line({ type: "user", message: { content: [{ type: "text", text: "[Request interrupted by user]" }] } });
    expect(parseTailLines([interrupted]).state).toBe("ended");
  });

  test("判定に使ったエントリの時刻を返す", () => {
    const entry = { type: "assistant", timestamp: "2026-10-23T13:36:05.860Z", message: { stop_reason: "tool_use", content: [{ type: "tool_use", name: "Read" }] } };
    expect(parseTailLines([line(entry)])).toEqual({ state: "active", at: Date.parse("2026-10-23T13:36:05.860Z") });
  });

  test("isMeta の行と壊れた行は読み飛ばす", () => {
    const meta = line({ type: "user", isMeta: true, message: { content: "<local-command-stdout>" } });
    expect(parseTailLines([assistant("end_turn", [{ type: "text", text: "x" }]), meta, "{broken"]).state).toBe("ended");
  });

  test("判断できる行がなければ unknown", () => {
    expect(parseTailLines([]).state).toBe("unknown");
    expect(parseTailLines([line({ type: "attachment" })]).state).toBe("unknown");
  });
});

describe("readTail と TranscriptLocator", () => {
  const root = mkdtempSync(join(tmpdir(), "session-board-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  test("巨大な行が末尾にあっても窓を広げて読める", () => {
    const path = join(root, "big.jsonl");
    const huge = line({ type: "attachment", body: "x".repeat(600 * 1024) });
    writeFileSync(path, [assistant("end_turn", [{ type: "text", text: "ok" }]), huge].join("\n") + "\n");
    expect(readTail(path).state).toBe("ended");
  });

  test("cwd から作るディレクトリ名で見つけ、見つからなければ索引から探す", () => {
    const projects = join(root, "projects");
    const cwd = "/Users/me/dev/app/.claude/worktrees/x";
    mkdirSync(join(projects, projectDirName(cwd)), { recursive: true });
    mkdirSync(join(projects, "elsewhere"), { recursive: true });
    writeFileSync(join(projects, projectDirName(cwd), "a.jsonl"), "");
    writeFileSync(join(projects, "elsewhere", "b.jsonl"), "");

    const locator = new TranscriptLocator(projects);
    expect(projectDirName(cwd)).toBe("-Users-me-dev-app--claude-worktrees-x");
    expect(locator.locate("a", [cwd])).toBe(join(projects, projectDirName(cwd), "a.jsonl"));
    expect(locator.locate("b", [cwd])).toBe(join(projects, "elsewhere", "b.jsonl"));
    expect(locator.locate("missing", [cwd])).toBeUndefined();
  });
});
