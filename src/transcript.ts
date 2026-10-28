import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

import type { TranscriptTail } from "./types";

// ターン終了を示す system エントリと assistant の stop_reason。
const END_SYSTEM_SUBTYPES = new Set(["stop_hook_summary", "turn_duration"]);
const END_STOP_REASONS = new Set(["end_turn", "stop_sequence", "max_tokens", "refusal"]);

// 1 行が数百 KB になることがあるので、末尾から窓を広げながら読む。
const TAIL_WINDOWS = [256 * 1024, 1024 * 1024, 4 * 1024 * 1024];

type Entry = {
  type?: string;
  subtype?: string;
  isMeta?: boolean;
  timestamp?: string;
  message?: { stop_reason?: string | null; content?: unknown };
};

type Block = { type?: string; name?: string; text?: string; input?: { questions?: { question?: string }[] } };

// JSONL の行（古い順）から、最後に意味のあるエントリを見てターンの状態を決める。
export function parseTailLines(lines: string[]): Omit<TranscriptTail, "mtimeMs"> {
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: Entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (entry.isMeta) continue;
    const parsedAt = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
    const at = Number.isNaN(parsedAt) ? undefined : parsedAt;

    if (entry.type === "system") {
      if (entry.subtype && END_SYSTEM_SUBTYPES.has(entry.subtype)) return { state: "ended", at };
      continue;
    }

    if (entry.type === "assistant") {
      const blocks = (Array.isArray(entry.message?.content) ? entry.message.content : []) as Block[];
      const ask = blocks.find(b => b?.type === "tool_use" && b.name === "AskUserQuestion");
      if (ask) return { state: "asking", at, question: ask.input?.questions?.[0]?.question };
      const usesTool = blocks.some(b => b?.type === "tool_use");
      const stop = entry.message?.stop_reason ?? "";
      if (!usesTool && END_STOP_REASONS.has(stop)) return { state: "ended", at };

      return { state: "active", at };
    }

    if (entry.type === "user") {
      const content = entry.message?.content;
      const text =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? (content as Block[]).filter(b => b?.type === "text").map(b => b.text ?? "").join("")
            : "";
      if (text.startsWith("[Request interrupted by user")) return { state: "ended", at };

      return { state: "active", at };
    }
  }

  return { state: "unknown" };
}

export function readTail(path: string): TranscriptTail {
  const { size, mtimeMs } = statSync(path);
  const fd = openSync(path, "r");
  try {
    for (const window of TAIL_WINDOWS) {
      const length = Math.min(size, window);
      const buffer = Buffer.alloc(length);
      readSync(fd, buffer, 0, length, size - length);
      const lines = buffer.toString("utf-8").split("\n").filter(Boolean);
      // 窓の先頭行は途中から始まっている可能性があるので捨てる（ファイル先頭なら残す）。
      if (length < size) lines.shift();
      const parsed = parseTailLines(lines);
      if (parsed.state !== "unknown" || length === size) return { ...parsed, mtimeMs };
    }

    return { state: "unknown", mtimeMs };
  } finally {
    closeSync(fd);
  }
}

// ~/.claude/projects/<cwd の英数字以外を - にした名前>/<cliSessionId>.jsonl
export function projectDirName(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

export class TranscriptLocator {
  private index = new Map<string, string>();
  private indexedAt = 0;

  constructor(
    private readonly projectsDir: string,
    private readonly reindexMs = 60_000,
  ) {}

  locate(cliSessionId: string, cwds: (string | undefined)[]): string | undefined {
    const file = `${cliSessionId}.jsonl`;
    for (const cwd of cwds) {
      if (!cwd) continue;
      const candidate = join(this.projectsDir, projectDirName(cwd), file);
      if (existsSync(candidate)) return candidate;
    }

    // 途中で cwd が変わったセッションなどは、プロジェクトディレクトリ全体の索引から探す。
    const cached = this.index.get(file);
    if (cached && existsSync(cached)) return cached;
    if (Date.now() - this.indexedAt > this.reindexMs) this.reindex();

    return this.index.get(file);
  }

  private reindex(): void {
    this.indexedAt = Date.now();
    this.index.clear();
    if (!existsSync(this.projectsDir)) return;
    for (const dir of readdirSync(this.projectsDir)) {
      let names: string[];
      try {
        names = readdirSync(join(this.projectsDir, dir));
      } catch {
        continue;
      }
      for (const name of names) {
        if (name.endsWith(".jsonl")) this.index.set(name, join(this.projectsDir, dir, name));
      }
    }
  }
}
