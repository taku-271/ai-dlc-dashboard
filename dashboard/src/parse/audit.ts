import type { AuditEvent } from "../types.ts";

const FIELD_RE = /^\*\*(.+?)\*\*:[ \t]*(.*?)\s*$/;

export interface ShardParseResult {
  events: AuditEvent[];
  /** Number of `## ` blocks skipped because Timestamp/Event was missing or invalid. */
  malformed: number;
}

/** Parses one audit shard file into events, in file order. */
export function parseAuditShard(text: string, shard: string): ShardParseResult {
  const events: AuditEvent[] = [];
  let malformed = 0;
  let title: string | null = null;
  let fields: Record<string, string> = {};

  const flush = () => {
    if (title === null) return;
    const ts = fields.Timestamp;
    const ev = fields.Event;
    const time = ts ? Date.parse(ts) : NaN;
    if (!ts || !ev || Number.isNaN(time)) {
      malformed++;
    } else {
      events.push({ title, timestamp: ts, time, event: ev, fields, shard, index: events.length });
    }
    title = null;
    fields = {};
  };

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      flush();
      title = line.slice(3).trim();
      continue;
    }
    if (/^---\s*$/.test(line) || line.startsWith("# ")) {
      flush();
      continue;
    }
    if (title === null) continue;
    const m = FIELD_RE.exec(line);
    if (m && !(m[1]! in fields)) fields[m[1]!] = m[2]!;
  }
  flush();
  return { events, malformed };
}

/**
 * Merges shards into one timeline (FR-009): sort by time; equal times keep
 * in-shard order, and across shards follow shard file-name order.
 */
export function mergeShards(shards: { name: string; events: AuditEvent[] }[]): AuditEvent[] {
  const ordered = [...shards].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const all: { e: AuditEvent; shardRank: number }[] = [];
  ordered.forEach((s, shardRank) => s.events.forEach((e) => all.push({ e, shardRank })));
  all.sort((a, b) => a.e.time - b.e.time || a.shardRank - b.shardRank || a.e.index - b.e.index);
  return all.map((x) => x.e);
}
