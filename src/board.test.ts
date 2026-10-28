import { describe, expect, test } from "bun:test";

import { classify, gateOwnersOf, groupOf, STALL_MS, type Signals } from "./board";
import type { IntentInfo } from "./types";

const NOW = 1_800_000_000_000;

function signals(overrides: Partial<Signals> = {}): Signals {
  return {
    now: NOW,
    tail: { state: "ended", mtimeMs: NOW - 60_000, at: NOW - 60_000 },
    // ターン開始の境界。処理中のエントリはこれより新しい
    lastTurnEdgeAt: NOW - 120_000,
    hasRunInApp: true,
    userFrameAfterTurnEdge: false,
    lastActivityAt: NOW - 60_000,
    interruptedAwaitingPerson: false,
    gateOpen: [],
    hasOpenPr: false,
    ...overrides,
  };
}

describe("classify", () => {
  test("AskUserQuestion の回答待ちは要対応", () => {
    expect(classify(signals({ tail: { state: "asking", mtimeMs: NOW, at: NOW - 1_000, question: "A と B どちら？" } }))).toEqual({
      column: "action",
      reasons: ["質問への回答待ち: A と B どちら？"],
    });
  });

  test("最近動いている処理中のターンは実行中", () => {
    const tail = { state: "active" as const, mtimeMs: NOW - 5_000, at: NOW - 5_000 };
    expect(classify(signals({ tail, statusCategory: "blocked" })).column).toBe("running");
  });

  test("処理中のまま 10 分以上止まっていれば要対応", () => {
    const stalled = NOW - STALL_MS - 1;
    const result = classify(signals({ tail: { state: "active", mtimeMs: stalled, at: stalled }, lastTurnEdgeAt: stalled - 60_000 }));
    expect(result.column).toBe("action");
    expect(result.reasons[0]).toContain("10分以上動きがありません");
  });

  test("末尾が処理中・質問中でも、アプリがその後にターン終了を記録していれば終わっている", () => {
    const tail = { state: "active" as const, mtimeMs: NOW - STALL_MS * 10, at: NOW - STALL_MS * 10 };
    expect(classify(signals({ tail, lastTurnEdgeAt: tail.at + 3_000, statusCategory: "completed" })).column).toBe("done");
    const ask = { state: "asking" as const, mtimeMs: NOW - 5_000, at: NOW - 5_000 };
    expect(classify(signals({ tail: ask, lastTurnEdgeAt: NOW - 1_000 })).column).toBe("done");
  });

  test("アプリでターンを回したことがない（フォーク元から写しただけの）会話の質問は回答待ちにしない", () => {
    const ask = { state: "asking" as const, mtimeMs: NOW - 5_000, at: NOW - 5_000 };
    expect(classify(signals({ tail: ask, lastTurnEdgeAt: undefined, hasRunInApp: false })).column).toBe("done");
  });

  test("ターン境界を記録する前の古いセッションはトランスクリプトで判定する", () => {
    const ask = { state: "asking" as const, mtimeMs: NOW - 5_000, at: NOW - 5_000 };
    expect(classify(signals({ tail: ask, lastTurnEdgeAt: undefined, hasRunInApp: true })).column).toBe("action");
  });

  test("トランスクリプトが読めなければアプリのターン境界で判定する", () => {
    expect(classify(signals({ tail: undefined, userFrameAfterTurnEdge: true, lastActivityAt: NOW - 1_000 })).column).toBe("running");
    expect(classify(signals({ tail: undefined, userFrameAfterTurnEdge: false })).column).toBe("done");
  });

  test("blocked は次にやることを理由にして要対応", () => {
    expect(classify(signals({ statusCategory: "blocked", needsAction: "CSV を送る" }))).toEqual({ column: "action", reasons: ["CSV を送る"] });
    expect(classify(signals({ statusCategory: "blocked" })).reasons).toEqual(["あなたの対応待ち"]);
  });

  test("中断・失敗・AI-DLC の承認ゲートも要対応", () => {
    expect(classify(signals({ interruptedAwaitingPerson: true })).column).toBe("action");
    expect(classify(signals({ statusCategory: "failed" })).column).toBe("action");
    expect(classify(signals({ gateOpen: ["requirements-analysis"] })).reasons).toEqual(["AI-DLC 承認ゲート: requirements-analysis"]);
  });

  test("レビュー待ちか未マージの PR があれば他者待ち、なければ完了", () => {
    expect(classify(signals({ statusCategory: "review_ready" })).column).toBe("waiting");
    expect(classify(signals({ statusCategory: "completed", hasOpenPr: true })).column).toBe("waiting");
    expect(classify(signals({ statusCategory: "completed" })).column).toBe("done");
    expect(classify(signals()).column).toBe("done");
  });
});

describe("groupOf", () => {
  test("自分に割り当てがなければ親をたどってグループを決める", () => {
    const assignments = new Map([["root", "g1"], ["own", "g2"]]);
    const parents = new Map([["child", "mid"], ["mid", "root"], ["own", "root"], ["loop-a", "loop-b"], ["loop-b", "loop-a"]]);
    expect(groupOf("child", assignments, parents)).toBe("g1");
    expect(groupOf("own", assignments, parents)).toBe("g2");
    expect(groupOf("orphan", assignments, parents)).toBeUndefined();
    expect(groupOf("loop-a", assignments, parents)).toBeUndefined();
  });
});

describe("gateOwnersOf", () => {
  const intent = (dirName: string, gateOpen: string[]): IntentInfo => ({
    slug: dirName,
    dirName,
    space: "default",
    gateOpen,
    revising: [],
    inProgress: [],
    done: 0,
    total: 1,
    source: "cursor",
  });

  test("同じフォルダ・同じインテントなら最後に動いたセッションだけが持つ", () => {
    const owners = gateOwnersOf([
      { id: "old", cwd: "/repo", intent: intent("i1", ["rq"]), lastActivityAt: 1 },
      { id: "new", cwd: "/repo", intent: intent("i1", ["rq"]), lastActivityAt: 2 },
      { id: "other-repo", cwd: "/repo2", intent: intent("i1", ["rq"]), lastActivityAt: 1 },
      { id: "no-gate", cwd: "/repo", intent: intent("i2", []), lastActivityAt: 3 },
    ]);
    expect([...owners].sort()).toEqual(["new", "other-repo"]);
  });
});
