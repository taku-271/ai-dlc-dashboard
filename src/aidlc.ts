import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { IntentInfo } from "./types";

type StateFields = Omit<IntentInfo, "slug" | "dirName" | "space" | "status" | "source">;

type IntentRow = { uuid?: string; slug?: string; dirName?: string; scope?: string; status?: string };

// aidlc-state.md の Stage Progress 行: "- [x] intent-capture — EXECUTE"
const STAGE_LINE = /^- \[(.)\] (\S+)\s+[—–-]+\s+(EXECUTE|SKIP)\b/;

export function parseState(markdown: string): StateFields {
  const field = (name: string) => markdown.match(new RegExp(`^- \\*\\*${name}\\*\\*:[ \\t]*(.*)$`, "m"))?.[1]?.trim() || undefined;
  const fields: StateFields = {
    project: field("Project"),
    scope: field("Scope"),
    currentStage: field("Current Stage"),
    gateOpen: [],
    revising: [],
    inProgress: [],
    done: 0,
    total: 0,
  };

  for (const line of markdown.split("\n")) {
    const m = line.match(STAGE_LINE);
    if (!m || m[3] !== "EXECUTE") continue;
    const [, mark, stage] = m;
    fields.total++;
    if (mark === "x") fields.done++;
    if (mark === "?") fields.gateOpen.push(stage);
    if (mark === "R") fields.revising.push(stage);
    if (mark === "-") fields.inProgress.push(stage);
  }

  return fields;
}

function readTrimmed(path: string): string | undefined {
  try {
    return readFileSync(path, "utf-8").trim() || undefined;
  } catch {
    return undefined;
  }
}

function readRows(intentsDir: string): IntentRow[] {
  const raw = readTrimmed(join(intentsDir, "intents.json"));
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn(`[aidlc] intents.json を読めません: ${intentsDir}`, error);
    return [];
  }
}

function listDirs(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  } catch {
    return [];
  }
}

// AI-DLC と同じ優先順位でセッションの作業中インテントを決める:
// セッション記録（aidlc/.aidlc-sessions/<session-id>）> active-intent カーソル > 唯一のインテント
export function resolveIntent(cwd: string, cliSessionId?: string): IntentInfo | undefined {
  const workspace = join(cwd, "aidlc");
  const spacesDir = join(workspace, "spaces");
  if (!existsSync(spacesDir)) return undefined;

  const activeSpace = readTrimmed(join(workspace, "active-space")) ?? "default";
  const safeId = cliSessionId?.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const stampedUuid = safeId ? readTrimmed(join(workspace, ".aidlc-sessions", safeId)) : undefined;

  let found: { space: string; dirName: string; row?: IntentRow; source: IntentInfo["source"] } | undefined;

  if (stampedUuid) {
    for (const space of listDirs(spacesDir)) {
      const row = readRows(join(spacesDir, space, "intents")).find(r => r.uuid === stampedUuid);
      if (row?.dirName) {
        found = { space, dirName: row.dirName, row, source: "session" };
        break;
      }
    }
  }

  const intentsDir = join(spacesDir, activeSpace, "intents");
  if (!found) {
    const cursor = readTrimmed(join(intentsDir, "active-intent"));
    if (cursor && existsSync(join(intentsDir, cursor, "aidlc-state.md"))) {
      found = { space: activeSpace, dirName: cursor, source: "cursor" };
    }
  }

  if (!found) {
    const records = listDirs(intentsDir).filter(d => existsSync(join(intentsDir, d, "aidlc-state.md")));
    if (records.length === 1) found = { space: activeSpace, dirName: records[0], source: "lone" };
  }

  if (!found) return undefined;

  const row = found.row ?? readRows(join(spacesDir, found.space, "intents")).find(r => r.dirName === found.dirName);
  const state = readTrimmed(join(spacesDir, found.space, "intents", found.dirName, "aidlc-state.md"));
  const fields = state ? parseState(state) : parseState("");

  return {
    ...fields,
    scope: fields.scope ?? row?.scope,
    slug: row?.slug ?? found.dirName,
    dirName: found.dirName,
    space: found.space,
    status: row?.status,
    source: found.source,
  };
}
