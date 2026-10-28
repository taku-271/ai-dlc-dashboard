// カンバンの列。要対応を最優先で並べる。
export type Column = "action" | "running" | "waiting" | "done";

// デスクトップアプリが claude-code-sessions/<account>/<org>/local_*.json に保存する
// セッション記録のうち、ダッシュボードが読むフィールドだけ。アプリ内部の形式なので
// すべて省略可能として扱う。
export interface DesktopSession {
  sessionId: string;
  cliSessionId?: string;
  title?: string;
  cwd?: string;
  originCwd?: string;
  branch?: string;
  isArchived?: boolean;
  createdAt?: number;
  lastActivityAt?: number;
  lastTurnEdgeAt?: number;
  latestUserFrameAt?: number;
  completedTurns?: number;
  prs?: DesktopPr[];
  postTurnSummary?: PostTurnSummary | null;
  postTurnSummaryFor?: string;
  lastAssistantUuid?: string;
  interruptedAwaitingPerson?: unknown;
  spawnedFrom?: { sessionId?: string; name?: string; title?: string } | null;
  lastTurnReport?: string;
  turnWrapUp?: { description?: string } | null;
}

export interface DesktopPr {
  prNumber: number;
  url?: string;
  state?: string;
  repo?: string;
}

export interface PostTurnSummary {
  status_category?: string;
  status_detail?: string;
  needs_action?: string;
  summarizes_uuid?: string;
}

// サイドバーのカスタムグループ。order はサイドバー上の並び順（小さいほど上）。
export interface SidebarGroup {
  id: string;
  name: string;
  order: number;
}

export interface SidebarInfo {
  groups: SidebarGroup[];
  assignments: Map<string, string>; // sessionId -> groupId
  pinned: Set<string>;
}

// CLI トランスクリプト末尾から読み取ったターンの状態。
// ended: ターン終了 / active: 処理中 / asking: AskUserQuestion の回答待ち
// at は判定に使ったエントリの時刻（アプリのターン境界と突き合わせる）。
export interface TranscriptTail {
  state: "ended" | "active" | "asking" | "unknown";
  mtimeMs: number;
  at?: number;
  question?: string;
}

export interface IntentInfo {
  slug: string;
  dirName: string;
  space: string;
  scope?: string;
  status?: string;
  project?: string;
  currentStage?: string;
  gateOpen: string[];
  revising: string[];
  inProgress: string[];
  done: number;
  total: number;
  source: "session" | "cursor" | "lone";
}

export interface Card {
  id: string;
  title: string;
  link: string;
  repo: string;
  branch?: string;
  cwd?: string;
  column: Column;
  reasons: string[];
  statusCategory?: string;
  statusDetail?: string;
  needsAction?: string;
  summaryStale: boolean;
  lastReport?: string;
  prs: DesktopPr[];
  group?: { id: string; name: string; order: number };
  pinned: boolean;
  parent?: { id: string; title?: string };
  lastActivityAt?: number;
  createdAt?: number;
  intent?: IntentInfo;
}

export interface Board {
  generatedAt: number;
  cards: Card[];
  groups: SidebarGroup[];
  warnings: string[];
}
