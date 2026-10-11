const ANSWER_RE = /^\[Answer\]:(.*)$/;

/**
 * Counts unanswered `[Answer]:` lines (nothing but whitespace after the colon).
 * Only lines that start with `[Answer]:` count; mentions mid-line are ignored.
 */
export function countUnanswered(text: string): { total: number; unanswered: number } {
  let total = 0;
  let unanswered = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = ANSWER_RE.exec(line);
    if (!m) continue;
    total++;
    if (m[1]!.trim() === "") unanswered++;
  }
  return { total, unanswered };
}
