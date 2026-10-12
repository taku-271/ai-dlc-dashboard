import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { attentionList, summarize } from "../src/model/view.ts";
import { LocalFsSource } from "../src/source/local-fs.ts";
import { copyFixture, waitFor } from "./helpers/fixture.ts";

const NOW = new Date("2026-10-11T05:00:00Z");
let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function fixture() {
  const f = copyFixture();
  cleanup = f.cleanup;
  return f.root;
}

describe("LocalFsSource on the fixture repo", () => {
  test("every fixture intent gets the expected status", async () => {
    const views = await new LocalFsSource(fixture()).listIntents(NOW);
    const bySlug = Object.fromEntries(views.map((v) => [v.slug, v.status]));
    expect(bySlug).toEqual({
      "fx-approval-inception": "awaiting-approval",
      "fx-approval-construction": "awaiting-approval",
      "fx-failed": "blocked-failed",
      "fx-questions": "blocked-questions",
      "fx-idle": "blocked-idle",
      "fx-ai-working": "ai-working",
      "fx-complete": "complete",
      "fx-broken-state": "unavailable",
      "fx-parked": "parked",
    });
  });

  test("attention list order, tags, headlines and summary", async () => {
    const views = await new LocalFsSource(fixture()).listIntents(NOW);
    const att = attentionList(views);
    expect(att.map((v) => [v.slug, v.highImpact, v.headline, v.waitingSince])).toEqual([
      ["fx-idle", false, "セッション終了から 9時間 放置", "2026-10-10T20:00:00Z"],
      ["fx-failed", false, "失敗で停止: bun test が 3 件失敗", "2026-10-11T01:00:00Z"],
      ["fx-questions", false, "未回答の質問 3件", "2026-10-11T02:00:00Z"],
      ["fx-approval-inception", true, "requirements-analysis の承認（成果物2件）", "2026-10-11T03:00:00Z"],
      ["fx-approval-construction", false, "code-generation の承認（成果物3件）", "2026-10-11T00:30:00Z"],
    ]);
    expect(summarize(views)).toEqual({ awaitingApproval: 2, blocked: 3, aiWorking: 1, complete: 1, parked: 1, unavailable: 1 });
  });

  test("broken state reports which file and field", async () => {
    const views = await new LocalFsSource(fixture()).listIntents(NOW);
    const broken = views.find((v) => v.slug === "fx-broken-state")!;
    expect(broken.unavailableReasons).toEqual([
      "aidlc/spaces/default/intents/261008-fx-broken-state/aidlc-state.md に Current Stage 欄がない",
    ]);
  });

  test("broken intents.json becomes a 取得不可 row instead of an exception", async () => {
    const root = fixture();
    writeFileSync(join(root, "aidlc/spaces/team-b/intents/intents.json"), "{ not json");
    const views = await new LocalFsSource(root).listIntents(NOW);
    const row = views.find((v) => v.space === "team-b")!;
    expect(row.status).toBe("unavailable");
    expect(row.unavailableReasons[0]).toContain("aidlc/spaces/team-b/intents/intents.json");
    expect(views.filter((v) => v.space === "default")).toHaveLength(8);
  });

  test("missing state file and missing audit dir", async () => {
    const root = fixture();
    const rec = join(root, "aidlc/spaces/default/intents/261006-fx-ai-working");
    rmSync(join(rec, "aidlc-state.md"));
    rmSync(join(rec, "audit"), { recursive: true });
    const v = (await new LocalFsSource(root).listIntents(NOW)).find((x) => x.slug === "fx-ai-working")!;
    expect(v.status).toBe("unavailable");
    expect(v.unavailableReasons.join("\n")).toContain("audit/ がない");
    expect(v.unavailableReasons.join("\n")).toContain("aidlc-state.md がない");
  });

  test("a repo without aidlc/ yields an empty list", async () => {
    const root = fixture();
    rmSync(join(root, "aidlc"), { recursive: true });
    expect(await new LocalFsSource(root).listIntents(NOW)).toEqual([]);
  });

  test("questions files under construction/<unit>/<stage>/ are found", async () => {
    const root = fixture();
    const dir = join(root, "aidlc/spaces/default/intents/261006-fx-ai-working/construction/unit-a/code-generation");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "code-generation-questions.md"), "[Answer]:\n");
    const v = (await new LocalFsSource(root).listIntents(NOW)).find((x) => x.slug === "fx-ai-working")!;
    expect([v.status, v.unansweredQuestions]).toEqual(["blocked-questions", 1]);
  });
});

describe("LocalFsSource.watch (FR-030 / FR-031)", () => {
  test("native watch notifies within 5 seconds of a file change", async () => {
    const root = fixture();
    const src = new LocalFsSource(root);
    let changes = 0;
    const h = src.watch(() => changes++);
    try {
      expect(h.mode).toBe("watch");
      await Bun.sleep(100);
      appendFileSync(join(root, "aidlc/spaces/default/intents/261006-fx-ai-working/audit/vm-aaaa.md"), "\n## Session End\n**Timestamp**: 2026-10-11T04:00:00Z\n**Event**: SESSION_ENDED\n---\n");
      const ms = await waitFor(() => changes > 0, 5000);
      expect(ms).toBeLessThan(5000);
      const v = (await src.listIntents(NOW)).find((x) => x.slug === "fx-ai-working")!;
      expect(v.status).toBe("blocked-idle");
    } finally {
      h.close();
    }
  });

  test("falls back to polling when watch cannot start, and still notifies within 5 seconds", async () => {
    const root = fixture();
    const src = new LocalFsSource(root, {
      pollIntervalMs: 2000,
      watchFactory: () => {
        throw new Error("watch unsupported");
      },
    });
    let changes = 0;
    const origError = console.error;
    console.error = () => {};
    const h = src.watch(() => changes++);
    console.error = origError;
    try {
      expect(h.mode).toBe("poll");
      await Bun.sleep(300); // let the first fingerprint be taken
      writeFileSync(join(root, "aidlc/spaces/default/intents/261005-fx-idle/new-file.md"), "x");
      const ms = await waitFor(() => changes > 0, 5000);
      expect(ms).toBeLessThan(5000);
    } finally {
      h.close();
    }
  });

  test("close() stops notifications", async () => {
    const root = fixture();
    let changes = 0;
    const h = new LocalFsSource(root).watch(() => changes++);
    h.close();
    writeFileSync(join(root, "aidlc/spaces/default/intents/intents.json.bak"), "x");
    await Bun.sleep(400);
    expect(changes).toBe(0);
  });
});
