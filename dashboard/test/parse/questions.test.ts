import { describe, expect, test } from "bun:test";
import { countUnanswered } from "../../src/parse/questions.ts";

describe("countUnanswered", () => {
  test("counts only empty [Answer]: lines", () => {
    const text = "## Q1\n[Answer]: A\n\n## Q2\n[Answer]:\n\n## Q3\n[Answer]:   \t\n";
    expect(countUnanswered(text)).toEqual({ total: 3, unanswered: 2 });
  });

  test("ignores [Answer] mentioned mid-line or indented", () => {
    const text = "B. 回答は [Answer]: の後に書く\n  [Answer]:\n> [Answer]:\n[Answer]: X（その他）\n";
    expect(countUnanswered(text)).toEqual({ total: 1, unanswered: 0 });
  });

  test("real answered questions file has no unanswered lines", () => {
    const text = "[Answer]: X（最小で、一覧画面だけで良い）\n\n[Answer]: A, B, C\n\n[Answer]: A\n\n\n[Answer]: A（見本データを作る。用語の説明後に再回答）\n";
    expect(countUnanswered(text)).toEqual({ total: 4, unanswered: 0 });
  });

  test("empty file and CRLF line endings", () => {
    expect(countUnanswered("")).toEqual({ total: 0, unanswered: 0 });
    expect(countUnanswered("[Answer]:\r\n[Answer]: A\r\n")).toEqual({ total: 2, unanswered: 1 });
  });
});
