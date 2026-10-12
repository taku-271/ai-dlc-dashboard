// AI-DLC dashboard client. Plain JS, no build step; types via JSDoc.
// All file-derived strings are inserted with textContent (never innerHTML).
// @ts-check

/** @typedef {import("../src/types.ts").DashboardPayload} DashboardPayload */
/** @typedef {import("../src/types.ts").IntentView} IntentView */
/** @typedef {import("../src/types.ts").IntentStatus} IntentStatus */

const NA = "取得不可";

/** @type {Record<IntentStatus, { tone: string; icon: string }>} */
const STATUS_STYLE = {
  "blocked-failed": { tone: "blocked", icon: "!" },
  "blocked-questions": { tone: "blocked", icon: "!" },
  "blocked-idle": { tone: "blocked", icon: "!" },
  "awaiting-approval": { tone: "approval", icon: "?" },
  "ai-working": { tone: "ai", icon: "…" },
  complete: { tone: "quiet", icon: "✓" },
  parked: { tone: "quiet", icon: "‖" },
  unavailable: { tone: "unknown", icon: "—" },
};

/** @type {DashboardPayload | null} */
let last = null;
let sseConnected = true;

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} [className]
 * @param {string | null} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

/** @param {string} id */
function byTestId(id) {
  const node = document.querySelector(`[data-testid="${id}"]`);
  if (!(node instanceof HTMLElement)) throw new Error(`missing element ${id}`);
  return node;
}

/** "取得不可" marker with the reason as a tooltip. @param {string} [reason] */
function na(reason) {
  const s = el("span", "na", NA);
  s.title = reason || "ファイルから判定できませんでした";
  return s;
}

/** @param {number} ms */
function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "1分未満";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}日 ${hours}時間` : `${days}日`;
  if (hours > 0) return mins > 0 ? `${hours}時間 ${mins}分` : `${hours}時間`;
  return `${mins}分`;
}

/** @param {string | null} iso */
function formatTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** @param {IntentView} v */
function badge(v) {
  const st = STATUS_STYLE[v.status];
  const b = el("span", `badge ${st.tone}`);
  b.setAttribute("data-testid", "status-badge");
  b.append(el("span", "", st.icon), el("span", "", v.statusLabel));
  b.firstElementChild?.setAttribute("aria-hidden", "true");
  return b;
}

/** @param {DashboardPayload} p */
function renderSummary(p) {
  const s = p.summary;
  /** @type {[string, number, string, string][]} */
  const tiles = [
    ["承認待ち", s.awaitingApproval, "approval", "summary-approval"],
    ["ブロック", s.blocked, "human", "summary-blocked"],
    ["AI 作業中", s.aiWorking, "ai", "summary-ai"],
    ["完了", s.complete, "quiet", "summary-complete"],
  ];
  if (s.parked > 0) tiles.push(["一時停止", s.parked, "quiet", "summary-parked"]);
  if (s.unavailable > 0) tiles.push(["取得不可", s.unavailable, "quiet", "summary-unavailable"]);
  const ul = byTestId("summary");
  ul.replaceChildren(
    ...tiles.map(([label, n, tone, id]) => {
      const li = el("li", `tile ${tone}`);
      li.setAttribute("data-testid", id);
      li.append(el("span", "n", String(n)), el("span", "label", label));
      return li;
    }),
  );
}

/** @param {IntentView} v */
function waitNode(v) {
  const span = el("span", "wait");
  span.setAttribute("data-testid", "attention-wait");
  if (!v.waitingSince) {
    span.append("待ち時間 ", na("待ち時間の起点となるイベントが audit に見つかりません"));
    return span;
  }
  const ms = Date.now() - Date.parse(v.waitingSince);
  span.append("待ち ", el("strong", "", formatDuration(ms)));
  span.title = `${formatTime(v.waitingSince)} から`;
  return span;
}

/** @param {DashboardPayload} p */
function renderAttention(p) {
  const list = byTestId("attention-list");
  list.replaceChildren(
    ...p.attention.map((v) => {
      const tone = STATUS_STYLE[v.status].tone;
      const li = el("li", `att ${tone}`);
      li.setAttribute("data-testid", "attention-item");
      li.dataset.intent = v.id;

      const mid = el("div");
      const what = el("div", "what", v.headline ?? NA);
      if (v.highImpact) {
        const tag = el("span", "tag-impact", "影響大");
        tag.setAttribute("data-testid", "impact-tag");
        tag.title = "Ideation／Inception の承認は下流すべてに影響します";
        what.append(tag);
      }
      const who = el("div", "who", `${v.slug ?? NA}  ·  ${v.currentStage ?? NA}  ·  担当: ${v.owner}`);
      mid.append(what, who);
      li.append(badge(v), mid, waitNode(v));
      return li;
    }),
  );
  byTestId("attention-empty").hidden = p.attention.length > 0;
}

/** @param {IntentView} v */
function progressNode(v) {
  if (!v.progress) {
    const p = el("div", "phases-na");
    p.append("フェーズ進捗: ", na(v.unavailableReasons[0]));
    return p;
  }
  const wrap = el("div", "phases");
  wrap.setAttribute("data-testid", "phase-progress");
  wrap.setAttribute("role", "list");
  wrap.setAttribute("aria-label", "フェーズ進捗");
  for (const ph of v.progress) {
    const cell = el("div", `phase${ph.applicable ? "" : " off"}${v.phase === ph.phase ? " current" : ""}`);
    cell.setAttribute("role", "listitem");
    const label = ph.applicable ? `${ph.done}/${ph.total}` : "対象外";
    cell.title = `${ph.label}: ${ph.applicable ? `${ph.done} / ${ph.total} ステージ完了` : "実行対象のステージなし"}`;
    const bar = el("div", "bar");
    if (ph.applicable) {
      const fill = el("div", "fill");
      fill.style.width = `${Math.round((ph.done / ph.total) * 100)}%`;
      bar.append(fill);
    }
    cell.append(bar, el("span", "pl", ph.label), el("span", "pc", label));
    wrap.append(cell);
  }
  return wrap;
}

/**
 * @param {HTMLElement} dl
 * @param {string} term
 * @param {string | null} value
 * @param {string} [reason]
 */
function fact(dl, term, value, reason) {
  const dd = el("dd");
  if (value === null || value === "") dd.append(na(reason));
  else dd.textContent = value;
  dl.append(el("dt", "", term), dd);
}

/** @param {DashboardPayload} p */
function renderCards(p) {
  const root = byTestId("intent-cards");
  root.replaceChildren(
    ...p.intents.map((v) => {
      const tone = STATUS_STYLE[v.status].tone;
      const cls = tone === "blocked" ? "human" : tone === "approval" ? "approval" : tone === "quiet" ? "quiet" : "";
      const card = el("article", `card ${cls}`);
      card.setAttribute("data-testid", "intent-card");
      card.dataset.intent = v.id;
      card.dataset.status = v.status;

      const head = el("div", "card-head");
      const titles = el("div");
      titles.append(el("h3", "card-title", v.slug ?? NA), el("div", "card-sub", `${v.dirName ?? NA}${v.space !== "default" ? `  ·  space: ${v.space}` : ""}`));
      head.append(titles, badge(v));

      const reason = v.unavailableReasons[0];
      const dl = el("dl", "facts");
      fact(dl, "現在ステージ", v.currentStage, reason);
      fact(dl, "担当エージェント", v.activeAgent, reason);
      fact(dl, "最終更新", formatTime(v.lastUpdated), reason);
      fact(dl, "担当者", v.owner);
      if (v.headline) fact(dl, "見るもの", v.headline);

      card.append(head, progressNode(v), dl);
      if (v.unavailableReasons.length > 0) {
        const ul = el("ul", "reasons");
        ul.setAttribute("data-testid", "unavailable-reasons");
        for (const r of v.unavailableReasons) ul.append(el("li", "", r));
        card.append(ul);
      }
      return card;
    }),
  );
  byTestId("cards-empty").hidden = p.intents.length > 0;
}

function renderStatusLine() {
  const mode = byTestId("update-mode");
  if (!sseConnected) {
    mode.textContent = "サーバーとの接続が切れています（再接続中）";
    mode.hidden = false;
  } else if (last?.updateMode === "poll") {
    mode.textContent = "ポーリングで更新中";
    mode.hidden = false;
  } else {
    mode.hidden = true;
  }
  const gen = byTestId("generated-at");
  gen.textContent = last ? `更新: ${formatTime(last.generatedAt)}` : "";
}

function render() {
  if (!last) return;
  renderSummary(last);
  renderAttention(last);
  renderCards(last);
  renderStatusLine();
}

let inflight = false;
let again = false;
async function refresh() {
  if (inflight) {
    again = true;
    return;
  }
  inflight = true;
  const errBox = byTestId("load-error");
  try {
    const res = await fetch("/api/intents", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) throw new Error(body && body.error ? body.error : `HTTP ${res.status}`);
    last = /** @type {DashboardPayload} */ (body);
    errBox.hidden = true;
    render();
  } catch (e) {
    errBox.textContent = `データを読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`;
    errBox.hidden = false;
  } finally {
    inflight = false;
    if (again) {
      again = false;
      void refresh();
    }
  }
}

/** @type {ReturnType<typeof setTimeout> | null} */
let debounce = null;
function scheduleRefresh() {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void refresh(), 150);
}

function connect() {
  const es = new EventSource("/events");
  es.addEventListener("hello", () => {
    const wasDown = !sseConnected;
    sseConnected = true;
    renderStatusLine();
    if (wasDown) scheduleRefresh();
  });
  es.addEventListener("change", scheduleRefresh);
  es.onerror = () => {
    sseConnected = false;
    renderStatusLine();
  };
}

void refresh();
connect();
// Wait times tick locally; a periodic refetch keeps server-side text (e.g. idle duration) fresh.
setInterval(render, 30_000);
setInterval(() => void refresh(), 60_000);
