import { describe, expect, test } from "bun:test";
import { parseRegistry } from "../../src/parse/registry.ts";

describe("parseRegistry", () => {
  test("reads the real intents.json shape", () => {
    const text = JSON.stringify([
      { uuid: "01a1", slug: "dashboard-v1", dirName: "261011-dashboard-v1", scope: "poc", status: "in-flight" },
    ]);
    const r = parseRegistry(text, "default");
    expect(r).toEqual({
      ok: true,
      entries: [{ space: "default", uuid: "01a1", slug: "dashboard-v1", dirName: "261011-dashboard-v1", scope: "poc", status: "in-flight" }],
    });
  });

  test("missing fields become null instead of guesses", () => {
    const r = parseRegistry(JSON.stringify([{ slug: "x" }, 42]), "default");
    if (!r.ok) throw new Error("expected ok");
    expect(r.entries[0]).toMatchObject({ slug: "x", dirName: null, status: null, uuid: null });
    expect(r.entries[1]).toMatchObject({ slug: null, dirName: null });
  });

  test("broken JSON is reported, not thrown", () => {
    const r = parseRegistry("[{ broken", "default");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("JSON として読めない");
  });

  test("non-array top level is reported", () => {
    const r = parseRegistry(`{"slug":"x"}`, "default");
    expect(r).toEqual({ ok: false, reason: "intents.json の最上位が配列ではない" });
  });

  test("empty file is reported", () => {
    expect(parseRegistry("", "default").ok).toBe(false);
  });
});
