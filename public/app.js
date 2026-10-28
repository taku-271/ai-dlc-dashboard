const POLL_MS = 5000;
const MAX_PRS = 3;

const COLUMNS = [
  { key: "action", icon: "🙋", name: "要対応", hint: "返事・承認・操作を待っているセッション" },
  { key: "running", icon: "⚙️", name: "実行中", hint: "Claude が今まさに作業中" },
  { key: "waiting", icon: "⏳", name: "他者待ち", hint: "PR レビュー・CI など自分以外を待っている" },
  { key: "done", icon: "✅", name: "完了・アイドル", hint: "ひと区切りついたセッション" },
];

const ALL = "__all__";
const NONE = "__none__";

const state = {
  board: null,
  group: load("group", ALL),
  query: "",
  hideDone: load("hideDone", false),
  seenAction: null, // 前回の要対応 ID。新しく入ったカードを光らせる
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(`session-board:${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(`session-board:${key}`, JSON.stringify(value));
  } catch {
    /* 保存できなくても表示は続ける */
  }
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function relative(ms, now) {
  if (!ms) return "";
  const minutes = Math.floor((now - ms) / 60000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

function matches(card) {
  if (state.group === NONE && card.group) return false;
  if (state.group !== ALL && state.group !== NONE && card.group?.id !== state.group) return false;
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [card.title, card.repo, card.branch, card.intent?.slug, card.intent?.project, card.statusDetail]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

// サイドバーのグループ順（上のグループほど優先）→ 新しい順
function compare(a, b) {
  const ga = a.group ? a.group.order : Number.MAX_SAFE_INTEGER;
  const gb = b.group ? b.group.order : Number.MAX_SAFE_INTEGER;
  if (ga !== gb) return ga - gb;
  return (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0);
}

function renderIntent(intent) {
  const stage = intent.currentStage ? `ステージ: ${intent.currentStage}` : null;
  const meta = [intent.scope, stage, intent.status === "complete" ? "完了済み" : null].filter(Boolean).join(" · ");
  const percent = intent.total > 0 ? Math.round((intent.done / intent.total) * 100) : 0;
  const sourceNote = intent.source === "session" ? undefined : "フォルダの active-intent から推定";

  return el(
    "div",
    { class: "intent", title: [intent.project, sourceNote].filter(Boolean).join("\n") || undefined },
    el(
      "div",
      { class: "intent__head" },
      el("span", { class: "intent__tag" }, "AI-DLC"),
      el("span", { class: "intent__slug" }, intent.slug),
      intent.total > 0 && el("span", { class: "intent__meta" }, `${intent.done}/${intent.total}`),
    ),
    meta && el("div", { class: "intent__meta" }, meta),
    intent.total > 0 && el("div", { class: "intent__bar" }, el("div", { class: "intent__fill", style: `width:${percent}%` })),
  );
}

function renderPr(pr) {
  return el(
    "a",
    { class: `pr pr--${(pr.state ?? "").toLowerCase()}`, href: pr.url, target: "_blank", rel: "noreferrer" },
    `#${pr.prNumber} ${pr.state ?? ""}`,
  );
}

// PR が多いセッションは未マージだけを出し、残りは件数にまとめる
function renderPrs(prs) {
  if (prs.length <= MAX_PRS) return prs.map(renderPr);
  const open = prs.filter(pr => pr.state === "OPEN");
  const rest = prs.length - open.length;
  return [...open.map(renderPr), rest > 0 && el("span", { class: "pr pr--closed" }, `ほか ${rest} 件はマージ・クローズ済み`)];
}

function renderCard(card, now, isNew) {
  const reasons = card.reasons.length > 0 ? card.reasons : null;
  const detail = card.statusDetail && !card.reasons.includes(card.statusDetail) ? card.statusDetail : card.lastReport;

  return el(
    "article",
    { class: `card${isNew ? " is-new" : ""}` },
    el(
      "div",
      { class: "card__top" },
      card.pinned && el("span", { title: "ピン留め" }, "★"),
      card.group && el("span", { class: "card__group" }, card.group.name),
      el("span", { class: "card__time", title: card.lastActivityAt ? new Date(card.lastActivityAt).toLocaleString("ja-JP") : undefined }, relative(card.lastActivityAt, now)),
    ),
    el(
      "h3",
      { class: "card__title" },
      card.column === "running" && el("span", { class: "card__live", "aria-label": "実行中" }),
      el("a", { class: "card__link", href: card.link, title: "Claude アプリでこのセッションを開く" }, card.title),
    ),
    el("div", { class: "card__repo", title: card.cwd }, [card.repo, card.branch].filter(Boolean).join(" · ")),
    reasons && el("ul", { class: "card__reasons" }, reasons.map(r => el("li", {}, r))),
    card.intent && renderIntent(card.intent),
    detail &&
      el(
        "p",
        { class: "card__detail" },
        detail,
        card.summaryStale && detail === card.statusDetail && el("span", { class: "card__stale" }, "（前のターンの要約）"),
      ),
    (card.prs.length > 0 || card.parent) &&
      el(
        "div",
        { class: "card__foot" },
        renderPrs(card.prs),
        card.parent &&
          el(
            "span",
            { class: "card__parent" },
            "↳ 親: ",
            el("a", { href: `claude://claude.ai/epitaxy/${card.parent.id}` }, card.parent.title ?? card.parent.id),
          ),
      ),
  );
}

function renderGroups(board) {
  const root = document.getElementById("groups");
  const counts = new Map();
  let ungrouped = 0;
  for (const card of board.cards) {
    if (card.group) counts.set(card.group.id, (counts.get(card.group.id) ?? 0) + 1);
    else ungrouped++;
  }
  const options = [
    { id: ALL, name: "すべて", count: board.cards.length },
    ...board.groups.filter(g => counts.has(g.id)).map(g => ({ id: g.id, name: g.name, count: counts.get(g.id) })),
    ...(ungrouped > 0 ? [{ id: NONE, name: "グループなし", count: ungrouped }] : []),
  ];
  if (!options.some(o => o.id === state.group)) state.group = ALL;

  root.replaceChildren(
    ...options.map(option => {
      const chip = el(
        "button",
        { class: "chip", type: "button", "aria-pressed": String(option.id === state.group) },
        option.name,
        el("span", { class: "chip__count" }, option.count),
      );
      chip.addEventListener("click", () => {
        state.group = option.id;
        save("group", option.id);
        render();
      });
      return chip;
    }),
  );
}

function render() {
  const board = state.board;
  if (!board) return;
  const now = Date.now();
  const visible = board.cards.filter(matches).sort(compare);
  const actionIds = new Set(board.cards.filter(c => c.column === "action").map(c => c.id));
  const fresh = state.seenAction ? new Set([...actionIds].filter(id => !state.seenAction.has(id))) : new Set();
  state.seenAction = actionIds;

  renderGroups(board);

  const summary = document.getElementById("summary");
  summary.replaceChildren(
    ...COLUMNS.map(col =>
      el("span", { class: `stat stat--${col.key}` }, `${col.icon} ${col.name} ${board.cards.filter(c => c.column === col.key).length}`),
    ),
  );
  document.title = actionIds.size > 0 ? `(${actionIds.size}) セッションボード` : "セッションボード";
  document.getElementById("updated").textContent = `${new Date(board.generatedAt).toLocaleTimeString("ja-JP")} 更新`;

  const boardEl = document.getElementById("board");
  boardEl.classList.toggle("is-hide-done", state.hideDone);
  const template = document.getElementById("column-template");
  boardEl.replaceChildren(
    ...COLUMNS.filter(col => !(state.hideDone && col.key === "done")).map(col => {
      const node = template.content.firstElementChild.cloneNode(true);
      const cards = visible.filter(c => c.column === col.key);
      node.classList.add(`column--${col.key}`);
      node.querySelector(".column__icon").textContent = col.icon;
      node.querySelector(".column__name").textContent = col.name;
      node.querySelector(".column__count").textContent = String(cards.length);
      node.querySelector(".column__hint").textContent = col.hint;
      const list = node.querySelector(".column__cards");
      if (cards.length === 0) list.append(el("div", { class: "column__empty" }, "なし"));
      else list.append(...cards.map(card => renderCard(card, now, fresh.has(card.id))));
      return node;
    }),
  );

  showBanner(board.warnings?.length ? `一部のデータを読めませんでした: ${board.warnings.join(" / ")}` : "");
}

function showBanner(text) {
  const banner = document.getElementById("banner");
  banner.hidden = !text;
  banner.textContent = text;
}

async function refresh() {
  try {
    const response = await fetch("/api/board", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.board = await response.json();
    render();
  } catch (error) {
    console.error(error);
    showBanner("サーバーに接続できません。`bun run start` が動いているか確認してください。");
  }
}

document.getElementById("search").addEventListener("input", event => {
  state.query = event.target.value;
  render();
});

const hideDone = document.getElementById("hide-done");
hideDone.checked = state.hideDone;
hideDone.addEventListener("change", () => {
  state.hideDone = hideDone.checked;
  save("hideDone", state.hideDone);
  render();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});

refresh();
setInterval(() => {
  if (!document.hidden) refresh();
}, POLL_MS);
