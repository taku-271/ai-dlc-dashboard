// Reads AI-DLC records straight from disk. READ-ONLY by construction (NFR-001):
// only readFile / readdir / stat / watch are used here. Do not add write APIs.
import { watch as fsWatch, type FSWatcher } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { mergeShards, parseAuditShard } from "../parse/audit.ts";
import { countUnanswered } from "../parse/questions.ts";
import { parseRegistry } from "../parse/registry.ts";
import { parseState } from "../parse/state.ts";
import type { IntentInput } from "../model/status.ts";
import { buildIntentView } from "../model/view.ts";
import type { AuditEvent, IntentRegistryEntry, IntentView, ParsedState } from "../types.ts";
import type { IntentSource, UpdateMode, WatchHandle } from "./source.ts";

export type WatchFactory = (dir: string, onEvent: () => void) => FSWatcher;

export interface LocalFsOptions {
  /** Polling interval used when native watching fails (FR-031). */
  pollIntervalMs?: number;
  /** Debounce for bursts of watch events. */
  debounceMs?: number;
  /** Injected for tests; defaults to recursive fs.watch. */
  watchFactory?: WatchFactory;
}

const defaultWatchFactory: WatchFactory = (dir, onEvent) => fsWatch(dir, { recursive: true }, () => onEvent());

function isErrno(e: unknown, code: string): boolean {
  return typeof e === "object" && e !== null && (e as NodeJS.ErrnoException).code === code;
}

function errText(e: unknown): string {
  return isErrno(e, "ENOENT") ? "がない" : `が読めない (${(e as Error)?.message ?? String(e)})`;
}

async function listDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name);
}

/** Directories named `stage` inside the record (e.g. construction/<unit>/<stage>), depth <= 3. */
async function findStageDirs(record: string, stage: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string, depth: number) => {
    let names: string[];
    try {
      names = await listDirs(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (depth === 0 && name === "audit") continue;
      const p = join(dir, name);
      if (name === stage) found.push(p);
      else if (depth < 2) await walk(p, depth + 1);
    }
  };
  await walk(record, 0);
  return found.sort();
}

export class LocalFsSource implements IntentSource {
  readonly root: string;
  private readonly opts: Required<LocalFsOptions>;

  constructor(root: string, options: LocalFsOptions = {}) {
    this.root = root;
    this.opts = {
      pollIntervalMs: options.pollIntervalMs ?? 2000,
      debounceMs: options.debounceMs ?? 150,
      watchFactory: options.watchFactory ?? defaultWatchFactory,
    };
  }

  private get spacesDir(): string {
    return join(this.root, "aidlc", "spaces");
  }

  async listIntents(now: Date = new Date()): Promise<IntentView[]> {
    let spaces: string[];
    try {
      spaces = (await listDirs(this.spacesDir)).sort();
    } catch (e) {
      if (isErrno(e, "ENOENT")) return [];
      throw e;
    }
    const views: IntentView[] = [];
    for (const space of spaces) {
      const registryPath = join(this.spacesDir, space, "intents", "intents.json");
      let text: string;
      try {
        text = await readFile(registryPath, "utf8");
      } catch (e) {
        if (isErrno(e, "ENOENT")) continue; // a space without intents
        views.push(this.registryProblemView(space, `aidlc/spaces/${space}/intents/intents.json ${errText(e)}`, now));
        continue;
      }
      const reg = parseRegistry(text, space);
      if (!reg.ok) {
        views.push(this.registryProblemView(space, `aidlc/spaces/${space}/intents/intents.json: ${reg.reason}`, now));
        continue;
      }
      const inputs = await Promise.all(reg.entries.map((entry) => this.readIntent(entry)));
      for (const input of inputs) views.push(buildIntentView(input, now));
    }
    return views;
  }

  private registryProblemView(space: string, reason: string, now: Date): IntentView {
    const entry: IntentRegistryEntry = { space, uuid: null, slug: `${space}/intents.json`, dirName: null, scope: null, status: null };
    const view = buildIntentView(
      { entry, state: null, events: null, unansweredQuestions: null, stageArtifactCount: null },
      now,
    );
    return { ...view, id: `${space}/(intents.json)`, unavailableReasons: [reason] };
  }

  /** Reads everything one intent needs. Never throws; problems become reasons. */
  async readIntent(entry: IntentRegistryEntry): Promise<IntentInput> {
    const input: IntentInput = { entry, state: null, events: null, unansweredQuestions: null, stageArtifactCount: null };
    if (!entry.dirName) return input;
    const rel = `aidlc/spaces/${entry.space}/intents/${entry.dirName}`;
    const record = join(this.spacesDir, entry.space, "intents", entry.dirName);
    const warnings: string[] = [];

    let state: ParsedState | null = null;
    try {
      state = parseState(await readFile(join(record, "aidlc-state.md"), "utf8"));
      input.state = state;
    } catch (e) {
      input.stateProblem = `${rel}/aidlc-state.md ${errText(e)}`;
    }

    try {
      const shardNames = (await readdir(join(record, "audit"))).filter((n) => n.endsWith(".md")).sort();
      const shards: { name: string; events: AuditEvent[] }[] = [];
      for (const name of shardNames) {
        try {
          const parsed = parseAuditShard(await readFile(join(record, "audit", name), "utf8"), name);
          if (parsed.malformed > 0) warnings.push(`${rel}/audit/${name} の ${parsed.malformed} 件のブロックが読めない（無視）`);
          shards.push({ name, events: parsed.events });
        } catch (e) {
          warnings.push(`${rel}/audit/${name} ${errText(e)}`);
        }
      }
      if (shards.length === 0) input.auditProblem = `${rel}/audit/ に読めるシャードがない`;
      else input.events = mergeShards(shards);
    } catch (e) {
      input.auditProblem = `${rel}/audit/ ${errText(e)}`;
    }

    const stage = state?.fields["Current Stage"];
    if (stage) {
      const dirs = await findStageDirs(record, stage);
      let unanswered = 0;
      let artifacts = 0;
      try {
        for (const dir of dirs) {
          for (const name of await readdir(dir)) {
            const p = join(dir, name);
            if (!(await stat(p)).isFile() || !name.endsWith(".md")) continue;
            if (name.endsWith("-questions.md")) {
              unanswered += countUnanswered(await readFile(p, "utf8")).unanswered;
            } else if (name !== "memory.md") {
              artifacts++;
            }
          }
        }
        input.unansweredQuestions = unanswered;
        input.stageArtifactCount = dirs.length > 0 ? artifacts : null;
      } catch (e) {
        input.questionsProblem = `${rel} の ${stage} の質問票 ${errText(e)}`;
      }
      // Prefer the engine's own artifact list when the gate event carries one.
      const gate = input.events?.findLast((e) => e.event === "STAGE_AWAITING_APPROVAL" && e.fields.Stage === stage);
      const listed = gate?.fields.Artifacts;
      if (listed) input.stageArtifactCount = listed.split(",").filter((s) => s.trim() !== "").length;
    }

    if (warnings.length > 0) input.warnings = warnings;
    return input;
  }

  /** Cheap fingerprint of the aidlc/spaces tree for the polling fallback. */
  async fingerprint(): Promise<string> {
    const parts: string[] = [];
    const walk = async (dir: string) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const d of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const p = join(dir, d.name);
        if (d.isDirectory()) await walk(p);
        else {
          try {
            const s = await stat(p);
            parts.push(`${p}:${s.size}:${s.mtimeMs}`);
          } catch {
            // vanished between readdir and stat; the next poll will see it
          }
        }
      }
    };
    await walk(this.spacesDir);
    return parts.join("\n");
  }

  watch(onChange: () => void): WatchHandle {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    const notify = () => {
      if (closed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!closed) onChange();
      }, this.opts.debounceMs);
    };

    let mode: UpdateMode = "watch";
    let watcher: FSWatcher | null = null;
    let poller: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      mode = "poll";
      let last: string | null = null;
      let busy = false;
      const tick = async () => {
        if (busy || closed) return;
        busy = true;
        try {
          const fp = await this.fingerprint();
          if (last !== null && fp !== last) notify();
          last = fp;
        } finally {
          busy = false;
        }
      };
      void tick();
      poller = setInterval(() => void tick(), this.opts.pollIntervalMs);
    };

    try {
      watcher = this.opts.watchFactory(join(this.root, "aidlc"), notify);
      watcher.on("error", (err) => {
        console.error(`[dashboard] ファイル監視が失敗したため、ポーリングに切り替えます: ${String(err)}`);
        watcher?.close();
        watcher = null;
        if (!closed && !poller) {
          startPolling();
          onChange(); // let clients pick up the new mode
        }
      });
    } catch (err) {
      console.error(`[dashboard] ファイル監視を開始できないため、ポーリングで更新します: ${String(err)}`);
      startPolling();
    }

    return {
      get mode() {
        return mode;
      },
      close() {
        closed = true;
        if (timer) clearTimeout(timer);
        watcher?.close();
        if (poller) clearInterval(poller);
      },
    };
  }
}
