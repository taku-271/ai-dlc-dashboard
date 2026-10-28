import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { DesktopSession, SidebarGroup, SidebarInfo } from "./types";

export const CLAUDE_APP_DIR = process.env.CLAUDE_APP_DIR ?? join(homedir(), "Library", "Application Support", "Claude");
export const CLAUDE_PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR ?? join(homedir(), ".claude", "projects");

type Cached<T> = { mtimeMs: number; value: T };

// mtime が変わったファイルだけ読み直す。セッション記録は 1 件 100KB を超えることがある。
export class JsonFileCache<T> {
  private entries = new Map<string, Cached<T>>();

  read(path: string): T {
    const { mtimeMs } = statSync(path);
    const hit = this.entries.get(path);
    if (hit && hit.mtimeMs === mtimeMs) return hit.value;
    const value = JSON.parse(readFileSync(path, "utf-8")) as T;
    this.entries.set(path, { mtimeMs, value });

    return value;
  }

  prune(alive: Set<string>): void {
    for (const path of this.entries.keys()) if (!alive.has(path)) this.entries.delete(path);
  }
}

export interface SessionFile {
  path: string;
  scope: string; // "<account>/<org>"
  session: DesktopSession;
}

const sessionCache = new JsonFileCache<DesktopSession>();

export function readDesktopSessions(appDir: string, warnings: string[]): SessionFile[] {
  const root = join(appDir, "claude-code-sessions");
  if (!existsSync(root)) {
    warnings.push(`セッション保存先が見つかりません: ${root}`);
    return [];
  }

  const files: SessionFile[] = [];
  const alive = new Set<string>();
  for (const account of readdirSync(root)) {
    const accountDir = join(root, account);
    if (!statSync(accountDir).isDirectory()) continue;
    for (const org of readdirSync(accountDir)) {
      const orgDir = join(accountDir, org);
      if (!statSync(orgDir).isDirectory()) continue;
      for (const name of readdirSync(orgDir)) {
        if (!name.startsWith("local_") || !name.endsWith(".json")) continue;
        const path = join(orgDir, name);
        alive.add(path);
        try {
          files.push({ path, scope: `${account}/${org}`, session: sessionCache.read(path) });
        } catch (error) {
          // アプリが書き込み途中のファイルは次回のポーリングで読めるので警告だけ残す。
          warnings.push(`セッション記録を読めません: ${name}`);
          console.warn(`[sources] ${path}`, error);
        }
      }
    }
  }
  sessionCache.prune(alive);

  return files;
}

type GroupScope = {
  groups?: { id?: string; name?: string }[];
  assignments?: Record<string, string>;
};

type DesktopConfig = {
  preferences?: {
    epitaxyPrefs?: {
      "dframe-group-scopes"?: Record<string, GroupScope>;
      "starred-local-code-sessions"?: string[];
    };
  };
};

const configCache = new JsonFileCache<DesktopConfig>();

// サイドバーのカスタムグループ・割り当て・ピン留めは claude_desktop_config.json の
// preferences.epitaxyPrefs にある。グループはアカウント/組織ごとに分かれている。
export function readSidebar(appDir: string, scope: string, warnings: string[]): SidebarInfo {
  const info: SidebarInfo = { groups: [], assignments: new Map(), pinned: new Set() };
  const path = join(appDir, "claude_desktop_config.json");
  let config: DesktopConfig;
  try {
    config = configCache.read(path);
  } catch (error) {
    warnings.push("サイドバーのグループ設定を読めません");
    console.warn(`[sources] ${path}`, error);
    return info;
  }

  const prefs = config.preferences?.epitaxyPrefs;
  const groupScope = prefs?.["dframe-group-scopes"]?.[scope];
  info.groups = (groupScope?.groups ?? [])
    .filter((g): g is { id: string; name: string } => typeof g?.id === "string")
    .map((g, order): SidebarGroup => ({ id: g.id, name: g.name ?? "", order }));
  for (const [key, groupId] of Object.entries(groupScope?.assignments ?? {})) {
    info.assignments.set(key.replace(/^code:/, ""), groupId);
  }
  for (const id of prefs?.["starred-local-code-sessions"] ?? []) info.pinned.add(id);

  return info;
}
