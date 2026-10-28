import { statSync } from "node:fs";
import { basename } from "node:path";

import { resolveIntent } from "./aidlc";
import { CLAUDE_APP_DIR, CLAUDE_PROJECTS_DIR, readDesktopSessions, readSidebar, type SessionFile } from "./sources";
import { readTail, TranscriptLocator } from "./transcript";
import type { Board, Card, Column, IntentInfo, TranscriptTail } from "./types";

// トランスクリプトがこの時間更新されないまま処理中に見えるターンは「止まっている」と見なす。
export const STALL_MS = 10 * 60_000;

export interface Signals {
  now: number;
  tail?: TranscriptTail;
  lastTurnEdgeAt?: number;
  hasRunInApp: boolean;
  userFrameAfterTurnEdge: boolean;
  lastActivityAt?: number;
  statusCategory?: string;
  needsAction?: string;
  interruptedAwaitingPerson: boolean;
  gateOpen: string[];
  hasOpenPr: boolean;
}

// トランスクリプトが処理中・質問中に見えても、アプリがその後にターン境界（終了）を
// 記録していればターンは終わっている。アプリでターンを回したことがないセッション
// （フォーク元から写された会話）の末尾は今の状態ではない。境界を記録する前の古い
// セッションは確かめようがないので、トランスクリプトを信じる。
export function isLiveTurn(tail: TranscriptTail, lastTurnEdgeAt: number | undefined, hasRunInApp: boolean): boolean {
  if (tail.state !== "active" && tail.state !== "asking") return false;
  if (!hasRunInApp) return false;
  if (lastTurnEdgeAt === undefined) return true;

  return tail.at === undefined || lastTurnEdgeAt <= tail.at;
}

export function classify(s: Signals): { column: Column; reasons: string[] } {
  const tail = s.tail;
  const known = tail !== undefined && tail.state !== "unknown";
  const live = known && isLiveTurn(tail, s.lastTurnEdgeAt, s.hasRunInApp);

  if (live && tail.state === "asking") {
    return { column: "action", reasons: [tail.question ? `質問への回答待ち: ${tail.question}` : "質問への回答待ち"] };
  }

  // トランスクリプトが読めないときは、アプリ側の「ユーザー送信がターン境界より新しい」で代用する。
  const activeTurn = known ? live : s.userFrameAfterTurnEdge;
  const lastMove = known ? tail.mtimeMs : (s.lastActivityAt ?? 0);
  if (activeTurn && s.now - lastMove < STALL_MS) return { column: "running", reasons: [] };

  const reasons: string[] = [];
  if (activeTurn) reasons.push("10分以上動きがありません（承認待ち・中断の可能性）");
  if (s.interruptedAwaitingPerson) reasons.push("中断したまま再開待ち");
  if (s.statusCategory === "failed") reasons.push("失敗して止まっています");
  if (s.statusCategory === "blocked" || s.needsAction) reasons.push(s.needsAction || "あなたの対応待ち");
  for (const stage of s.gateOpen) reasons.push(`AI-DLC 承認ゲート: ${stage}`);
  if (reasons.length > 0) return { column: "action", reasons };

  if (s.statusCategory === "review_ready" || s.hasOpenPr) return { column: "waiting", reasons: [] };

  return { column: "done", reasons: [] };
}

// 最後に動いたセッションのあるアカウント/組織を「今使っている」ものとして表示する。
function currentScope(files: SessionFile[]): string | undefined {
  let best: SessionFile | undefined;
  for (const f of files) {
    if ((f.session.lastActivityAt ?? 0) > (best?.session.lastActivityAt ?? -1)) best = f;
  }

  return best?.scope;
}

// active-intent カーソルはフォルダ単位で共有されるので、同じインテントを指す複数の
// セッションのうち最後に動いたものだけに承認ゲートを付ける（全部が要対応になるのを防ぐ）。
export function gateOwnersOf(
  items: { id: string; cwd?: string; intent?: IntentInfo; lastActivityAt?: number }[],
): Set<string> {
  const owners = new Map<string, { id: string; lastActivityAt: number }>();
  for (const item of items) {
    if (!item.intent?.gateOpen.length || !item.cwd) continue;
    const key = `${item.cwd}\0${item.intent.space}\0${item.intent.dirName}`;
    const at = item.lastActivityAt ?? 0;
    const owner = owners.get(key);
    if (!owner || at > owner.lastActivityAt) owners.set(key, { id: item.id, lastActivityAt: at });
  }

  return new Set([...owners.values()].map(o => o.id));
}

// 派生セッションはサイドバーで親の下に入れ子表示され、親のグループに属する。
export function groupOf(id: string, assignments: Map<string, string>, parents: Map<string, string>): string | undefined {
  const seen = new Set<string>();
  for (let current: string | undefined = id; current && !seen.has(current); current = parents.get(current)) {
    seen.add(current);
    const groupId = assignments.get(current);
    if (groupId) return groupId;
  }

  return undefined;
}

type TailKey = { mtimeMs: number; size: number };

export class BoardBuilder {
  private locator: TranscriptLocator;
  private tails = new Map<string, { key: TailKey; tail: TranscriptTail }>();

  constructor(
    private readonly appDir = CLAUDE_APP_DIR,
    projectsDir = CLAUDE_PROJECTS_DIR,
  ) {
    this.locator = new TranscriptLocator(projectsDir);
  }

  build(now = Date.now()): Board {
    const warnings: string[] = [];
    const all = readDesktopSessions(this.appDir, warnings);
    const scope = currentScope(all);
    const files = all.filter(f => f.scope === scope && !f.session.isArchived);
    const sidebar = scope ? readSidebar(this.appDir, scope, warnings) : undefined;
    const groupsById = new Map(sidebar?.groups.map(g => [g.id, g]));
    const titles = new Map(all.map(f => [f.session.sessionId, f.session.title]));
    const parents = new Map(all.flatMap(f => (f.session.spawnedFrom?.sessionId ? [[f.session.sessionId, f.session.spawnedFrom.sessionId] as const] : [])));

    const entries = files.map(({ session: s }) => {
      const intent = this.intentFor(s.cwd, s.cliSessionId, warnings);
      const tail = this.tailFor(s.cliSessionId, [s.cwd, s.originCwd], warnings);

      return { s, intent, tail };
    });
    const gateOwners = gateOwnersOf(entries.map(({ s, intent }) => ({ id: s.sessionId, cwd: s.cwd, intent, lastActivityAt: s.lastActivityAt })));

    const cards = entries.map(({ s, intent, tail }) => {
      const summary = s.postTurnSummary ?? undefined;
      const prs = (s.prs ?? []).filter(p => typeof p?.prNumber === "number");
      const groupId = sidebar ? groupOf(s.sessionId, sidebar.assignments, parents) : undefined;
      const parentId = s.spawnedFrom?.sessionId;
      const needsAction = summary?.needs_action || undefined;
      const { column, reasons } = classify({
        now,
        tail,
        lastTurnEdgeAt: s.lastTurnEdgeAt,
        hasRunInApp: s.lastTurnEdgeAt !== undefined || (s.completedTurns ?? 0) > 0,
        userFrameAfterTurnEdge: (s.latestUserFrameAt ?? 0) > (s.lastTurnEdgeAt ?? 0),
        lastActivityAt: s.lastActivityAt,
        statusCategory: summary?.status_category,
        needsAction,
        interruptedAwaitingPerson: s.interruptedAwaitingPerson != null,
        gateOpen: gateOwners.has(s.sessionId) ? (intent?.gateOpen ?? []) : [],
        hasOpenPr: prs.some(p => p.state === "OPEN"),
      });

      const card: Card = {
        id: s.sessionId,
        title: s.title || "(無題)",
        link: `claude://claude.ai/epitaxy/${s.sessionId}`,
        repo: basename(s.originCwd ?? s.cwd ?? "") || "-",
        branch: s.branch,
        cwd: s.cwd,
        column,
        reasons,
        statusCategory: summary?.status_category,
        statusDetail: summary?.status_detail,
        needsAction,
        summaryStale: !!summary && !!s.lastAssistantUuid && s.postTurnSummaryFor !== s.lastAssistantUuid,
        lastReport: s.turnWrapUp?.description ?? s.lastTurnReport,
        prs,
        group: groupId ? groupsById.get(groupId) : undefined,
        pinned: sidebar?.pinned.has(s.sessionId) ?? false,
        parent: parentId ? { id: parentId, title: titles.get(parentId) ?? s.spawnedFrom?.name } : undefined,
        lastActivityAt: s.lastActivityAt,
        createdAt: s.createdAt,
        intent,
      };

      return card;
    });

    return { generatedAt: now, cards, groups: sidebar?.groups ?? [], warnings };
  }

  private intentFor(cwd: string | undefined, cliSessionId: string | undefined, warnings: string[]): IntentInfo | undefined {
    if (!cwd) return undefined;
    try {
      return resolveIntent(cwd, cliSessionId);
    } catch (error) {
      warnings.push(`AI-DLC の状態を読めません: ${cwd}`);
      console.warn(`[board] resolveIntent ${cwd}`, error);
      return undefined;
    }
  }

  private tailFor(cliSessionId: string | undefined, cwds: (string | undefined)[], warnings: string[]): TranscriptTail | undefined {
    if (!cliSessionId) return undefined;
    const path = this.locator.locate(cliSessionId, cwds);
    if (!path) return undefined;
    try {
      const { mtimeMs, size } = statSync(path);
      const hit = this.tails.get(path);
      if (hit && hit.key.mtimeMs === mtimeMs && hit.key.size === size) return hit.tail;
      const tail = readTail(path);
      this.tails.set(path, { key: { mtimeMs: tail.mtimeMs, size }, tail });

      return tail;
    } catch (error) {
      warnings.push(`トランスクリプトを読めません: ${cliSessionId}`);
      console.warn(`[board] readTail ${path}`, error);
      return undefined;
    }
  }
}
