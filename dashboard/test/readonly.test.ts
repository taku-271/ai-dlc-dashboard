// NFR-001: the dashboard never writes to aidlc/ or .claude/ and never spawns the engine CLI.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LocalFsSource } from "../src/source/local-fs.ts";
import { startServer } from "../src/server.ts";
import { copyFixture, snapshot } from "./helpers/fixture.ts";

describe("read-only guarantee (NFR-001)", () => {
  test("listing, watching and serving leave aidlc/ and .claude/ byte-identical", async () => {
    const { root, cleanup } = copyFixture();
    try {
      const before = { aidlc: snapshot(join(root, "aidlc")), claude: snapshot(join(root, ".claude")) };
      const src = new LocalFsSource(root);
      const h = src.watch(() => {});
      await src.listIntents();
      const server = startServer({ root, port: 0 });
      try {
        const res = await fetch(`${server.url}/api/intents`);
        expect(res.status).toBe(200);
        await res.json();
      } finally {
        server.stop();
        h.close();
      }
      const after = { aidlc: snapshot(join(root, "aidlc")), claude: snapshot(join(root, ".claude")) };
      expect(after).toEqual(before);
      expect(Object.keys(before.aidlc).length).toBeGreaterThan(20);
    } finally {
      cleanup();
    }
  });

  test("source code uses no write or process-spawning APIs", () => {
    const forbidden =
      /\b(writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rm|rmSync|rmdir|unlink|unlinkSync|rename|renameSync|copyFile|cpSync|truncate|createWriteStream|Bun\.write|Bun\.spawn|Bun\.spawnSync)\s*\(|["'](node:)?child_process["']|\$`/;
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|js)$/.test(e.name)) files.push(p);
      }
    };
    walk(join(import.meta.dir, "..", "src"));
    walk(join(import.meta.dir, "..", "public"));
    const offenders = files.filter((f) => forbidden.test(readFileSync(f, "utf8")));
    expect(files.length).toBeGreaterThan(5);
    expect(offenders).toEqual([]);
  });
});
