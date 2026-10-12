import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const FIXTURE_REPO = join(import.meta.dir, "..", "fixtures", "repo");

/** Copies the fixture repo into a fresh temp dir (tests may mutate the copy). */
export function copyFixture(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "aidlc-dashboard-test-"));
  cpSync(FIXTURE_REPO, root, { recursive: true });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** path -> sha256 for every file (and dir marker) under `dir`. */
export function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, rel: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(p).isDirectory()) {
        out[`${r}/`] = "dir";
        walk(p, r);
      } else out[r] = createHash("sha256").update(readFileSync(p)).digest("hex");
    }
  };
  walk(dir, "");
  return out;
}

export function waitFor(pred: () => boolean, timeoutMs: number): Promise<number> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (pred()) {
        clearInterval(t);
        resolve(Date.now() - start);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        reject(new Error(`timed out after ${timeoutMs}ms`));
      }
    }, 25);
  });
}
