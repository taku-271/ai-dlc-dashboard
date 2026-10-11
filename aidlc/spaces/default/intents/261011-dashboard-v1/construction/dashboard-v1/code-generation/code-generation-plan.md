# コード生成計画: dashboard-v1

> 上流: `inception/requirements-analysis/requirements.md`（承認済み）。poc スコープのため、ユニット分割・機能設計・NFR 設計のステージはない。ユニットは「dashboard-v1」の1つだけとし、要件の「実装計画」をそのまま手順に展開する。
> テスト戦略: Minimal（要件ごとに1件以上のテスト）。ただし構築フェーズのルールに従い、各モジュールで正常系と異常系2件以上を含める。

## 手順

### Step 1: プロジェクトの土台
- [x] `dashboard/package.json`（依存なし。`bun test` と起動スクリプトだけ）、`dashboard/tsconfig.json`
- [x] `dashboard/README.md`（起動方法、読み取り専用であること、取得不可の意味）

### Step 2: データの型（`dashboard/src/types.ts`）
- [x] `IntentRegistryEntry`、`ParsedState`、`AuditEvent`、`IntentView`（状態、ボール、担当者、フェーズ進捗、待ち起点、一言表示、取得不可の理由）
- 対応要件: FR-008、FR-016、FR-020、FR-018

### Step 3: パーサー（`dashboard/src/parse/`）
- [x] `registry.ts`: `intents.json` → 一覧（壊れた JSON は例外ではなく取得不可）
- [x] `state.ts`: `aidlc-state.md` → 欄（`**キー**: 値`）とステージ行（チェックボックス、slug、EXECUTE/SKIP、フェーズ見出し）
- [x] `audit.ts`: audit シャード → イベント配列。全シャードを読み、時刻順に並べる（同時刻はシャード内の順、シャード間はファイル名順）
- [x] `questions.ts`: `*-questions.md` → 未回答の `[Answer]:` 件数
- 対応要件: FR-001〜FR-009（の入力）、FR-015

### Step 4: パーサーのテスト（`dashboard/test/parse/*.test.ts`）
- [x] 実データと同じ書式の入力での正常系、欄の欠落、壊れたファイル、空ファイル、同時刻の並び順

### Step 5: 状態判定と表示モデル（`dashboard/src/model/`）
- [x] `status.ts`: FR-001〜FR-008 の優先順で状態とボールを決める
- [x] `view.ts`: フェーズ進捗（EXECUTE を分母、`[x]` を分子）、待ち時間の起点、一言表示（FR-014）、サマリー件数（FR-010）、人待ちリストの並び順と「影響大」タグ（FR-011〜FR-013）、担当者フィルタ（FR-020、FR-021）

### Step 6: 状態判定のテスト（`dashboard/test/model/*.test.ts`）
- [x] 状態ごとの判定、`ERROR_LOGGED` だけでは「AI 作業中」、優先順位の衝突、並び順、取得不可の扱い

### Step 7: データ取得層（`dashboard/src/source/`）
- [x] `IntentSource` インターフェース（`listIntents(): Promise<IntentView[]>` と `watch(onChange)`）
- [x] `LocalFsSource`: `--root` 配下の `aidlc/spaces/*/intents/` を読む。ファイル監視（`fs.watch` 再帰）と、失敗時の2秒ポーリング（FR-030、FR-031）。書き込み系の API は一切使わない（NFR-001）

### Step 8: サーバー（`dashboard/src/server.ts`）
- [x] 引数 `--root`、`--port`（既定 4173）。ポート使用中は表示して終了（FR-040）
- [x] `127.0.0.1` のみで待ち受け（NFR-002）
- [x] `/api/intents`（JSON）、`/events`（SSE。変更を検知したら通知）、`/` と静的ファイル

### Step 9: 一覧画面（`dashboard/public/`）
- [x] `index.html`、`app.css`、`app.js`（ビルドなしで動く素の JS。型は JSDoc で付ける）
- [x] サマリー、人待ちリスト、全 Intent カード、5フェーズ進捗バー、状態色（人待ちだけ目立たせる）、取得不可の表示、「ポーリングで更新中」の表示
- [x] 操作要素に `data-testid` を付ける

### Step 10: 見本データ（`dashboard/test/fixtures/repo/aidlc/...`）
- [x] 7件: 承認待ち（Inception）、承認待ち（Construction）、失敗で停止、未回答の質問、放置、AI 作業中（`ERROR_LOGGED` あり）、完了、一時停止

### Step 11: 結合テストと読み取り専用テスト（`dashboard/test/`）
- [x] 見本データを一時ディレクトリにコピーして `LocalFsSource` で読み、期待する状態と並び順になること
- [x] ファイルを書き換えたら5秒以内に変更通知が来ること
- [x] 読み込みと監視の前後で、`aidlc/` と `.claude/` 相当のファイル一覧とハッシュが変わらないこと（NFR-001）

### Step 12: 仕上げ
- [x] `bun test dashboard` が全件成功、`tsc --noEmit` 相当の型チェック（bun の型チェックが使えなければ省略し、その旨を code-summary に書く）

## 実データでの確認方法

`bun dashboard/src/server.ts` を起動し、`http://127.0.0.1:4173` を開く。この Intent（`261011-dashboard-v1`）が表示されることを確認する。
