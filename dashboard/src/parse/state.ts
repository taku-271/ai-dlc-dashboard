import { PHASES, type Phase, type ParsedState, type StageLine, type StageMark } from "../types.ts";

const FIELD_RE = /^\s*-\s+\*\*(.+?)\*\*:[ \t]*(.*?)\s*$/;
const PHASE_HEADING_RE = /^###\s+([A-Za-z]+)\s+PHASE\s*$/i;
const STAGE_RE = /^\s*-\s+\[([ \-?Rx S])\]\s+([a-z0-9][a-z0-9-]*)\s+[—-]+\s+(EXECUTE|SKIP)\b/;

/**
 * Parses `aidlc-state.md`. Never throws: missing pieces simply do not appear in
 * the result, and the caller decides what is "取得不可".
 */
export function parseState(text: string): ParsedState {
  const fields: Record<string, string> = {};
  const stages: StageLine[] = [];
  let phase: Phase | null = null;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      // Leaving the Stage Progress section (or any other) resets the phase context.
      phase = null;
    }
    const heading = PHASE_HEADING_RE.exec(line);
    if (heading) {
      const name = heading[1]!.toLowerCase();
      phase = (PHASES as readonly string[]).includes(name) ? (name as Phase) : null;
      continue;
    }
    const stage = STAGE_RE.exec(line);
    if (stage) {
      if (phase) {
        stages.push({
          mark: stage[1] as StageMark,
          slug: stage[2]!,
          execute: stage[3] === "EXECUTE",
          phase,
        });
      }
      continue;
    }
    const field = FIELD_RE.exec(line);
    if (field) {
      const key = field[1]!.trim();
      const value = field[2]!;
      if (value !== "" && !(key in fields)) fields[key] = value;
    }
  }
  return { fields, stages };
}
