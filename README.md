# セッションボード（ai-dlc-dashboard）

Claude デスクトップアプリ（Code タブ）のセッションを、Backlog のようなカンバンで一覧するローカル Web ダッシュボードです。
「どのセッションが動いていて、どれが自分の返事を待っているのか」と「各セッションが AI-DLC のどのインテント・ステージにいるのか」を 1 画面で確認できます。

## 起動

```bash
bun install
```

```bash
bun run start
```

http://127.0.0.1:4319 を開きます（`PORT` で変更可）。画面は 5 秒ごとに更新されます。
カードのタイトルをクリックすると Claude アプリでそのセッションが開きます（`claude://` リンク）。

## 列の決め方

| 列 | 入る条件（上から順に判定） |
| --- | --- |
| 🙋 要対応 | `AskUserQuestion` の回答待ち／処理中のまま 10 分以上動きがない／中断したまま／アプリの要約が `blocked`・`failed` または「次にやること」がある／AI-DLC の承認ゲート（`[?]`）が開いている |
| ⚙️ 実行中 | トランスクリプト末尾が処理中で、10 分以内に更新されている |
| ⏳ 他者待ち | アプリの要約が `review_ready`、または未マージの PR がある |
| ✅ 完了・アイドル | 上のどれにも当たらない |

列の中は、サイドバーのグループ順（上のグループほど先）→ 最終アクティビティの新しい順に並びます。
派生セッション（サイドバーで親の下に入れ子になるもの）は、親のグループに属するものとして扱います。

## 読んでいるデータ（すべて読み取り専用）

| データ | 場所 |
| --- | --- |
| セッション一覧・状態要約・次にやること・PR | `~/Library/Application Support/Claude/claude-code-sessions/<account>/<org>/local_*.json` |
| サイドバーのグループ・ピン留め | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| ターンが進行中か・質問中か | `~/.claude/projects/<cwd>/<cliSessionId>.jsonl` の末尾 |
| AI-DLC のインテントとステージ | 各セッションの作業フォルダの `aidlc/`（`.aidlc-sessions/<cliSessionId>` → `active-intent` → 唯一のインテント、の順で解決） |

デスクトップアプリの内部ファイルを読んでいるため、アプリの更新で形式が変わると一部が表示されなくなることがあります。
読めなかったものは画面上部に警告として出ます。保存先は `CLAUDE_APP_DIR`・`CLAUDE_PROJECTS_DIR` で上書きできます。

サーバーは `127.0.0.1` だけで待ち受けます（セッションの内容を返すため、外部からは接続させません）。

## 開発

```bash
bun test
```

```bash
bun run typecheck
```

| ファイル | 役割 |
| --- | --- |
| `src/server.ts` | HTTP サーバー（`/api/board` と静的ファイル） |
| `src/board.ts` | 列の振り分け（`classify`）とボードの組み立て |
| `src/sources.ts` | デスクトップアプリのセッション記録・サイドバー設定の読み込み |
| `src/transcript.ts` | トランスクリプト末尾の解析と所在の特定 |
| `src/aidlc.ts` | AI-DLC のインテント解決と `aidlc-state.md` の解析 |
| `public/` | 画面（素の HTML / CSS / JS） |
