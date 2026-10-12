# コード生成サマリー: dashboard-v1

> 上流: `inception/requirements-analysis/requirements.md`、`construction/dashboard-v1/code-generation/code-generation-plan.md`（12手順すべて完了）

## 作成したファイル

すべて `dashboard/` 配下（`aidlc/` と `.claude/` には書いていない）。

| 区分 | ファイル |
|------|----------|
| 土台 | `package.json`、`tsconfig.json`、`bun.lock`、`README.md`、`.gitignore` |
| 型 | `src/types.ts` |
| パーサー | `src/parse/registry.ts`、`state.ts`、`audit.ts`、`questions.ts` |
| 状態判定・表示 | `src/model/status.ts`、`view.ts` |
| データ取得層 | `src/source/source.ts`（`IntentSource`）、`local-fs.ts`（`LocalFsSource`） |
| サーバー | `src/server.ts` |
| 画面 | `public/index.html`、`app.css`、`app.js` |
| テスト | `test/parse/*.test.ts`、`test/model/*.test.ts`、`test/source.test.ts`、`test/server.test.ts`、`test/readonly.test.ts`、`test/helpers/*` |
| 見本データ | `test/fixtures/repo/`（Intent 9件、2スペース） |

## 主な判断

- 値が取れないときは `null` とし、画面では必ず「取得不可」と表示する。待ち時間の起点は現在ステージのイベントに限り、別ステージの古いイベントで代用しない。
- 現在ステージが `[ ]`／`[S]` のときは「取得不可」（FR-008）。`[x]` で次ステージ未開始の間は「AI 作業中」（FR-007）。
- 成果物の件数は、ゲートのイベントの `Artifacts` 欄、なければ現在ステージのディレクトリの `.md`（`memory.md` と `*-questions.md` を除く）から数える。
- Initialization の承認は「影響大」にせず、3番目の順位とした（要件に定めがないため）。
- サーバーは `127.0.0.1` だけで待ち受け、許可した静的ファイルだけを配信する。CSP を付け、Host ヘッダーが `127.0.0.1`／`localhost` 以外なら 403、GET／HEAD 以外は 405 を返す。
- 監視は `fs.watch`（再帰）で、通知は 150 ms まとめて送る。監視が失敗したら2秒ポーリングに切り替え、画面に表示する。
- 状態の色は、人待ちだけ目立たせる（ブロック＝赤、承認待ち＝黄）。色に加えて記号と文字でも示す。

## テスト

- `bun test dashboard`: 80 件成功、0 件失敗（9ファイル）
- 型チェック（`tsc --noEmit`）: エラー 0
- 読み取り専用（NFR-001）: 見本データのコピーを読み込み・監視・配信する前後で、ファイル一覧とハッシュが変わらないこと。加えて、`src/` と `public/` に書き込み系 API と `child_process` がないこと
- 見本データでの人待ちリストの順: 放置 → 失敗で停止 → 未回答の質問 → Inception の承認（影響大）→ Construction の承認。Construction の承認は待ち時間が最長でも最後になる
- 画面: ファイル変更から画面反映まで約 0.3 秒（Playwright で計測）。幅 1280／390 で横スクロールなし

## 計画との差分

- 見本データは7件ではなく9件（一時停止を別スペースに置いた分と、取得不可の例を追加）
- テスト補助（`test/helpers/`）と `server.test.ts` を追加

## 未確認の事項

- macOS と WSL での動作（Linux でのみ確認）
- 本物の監視が実行中に失敗したときのポーリング切り替え（テストでは差し替えた監視関数で確認）
- NFR-005（Intent 10件で1秒以内）は計測していない。見本9件での一覧生成は数ミリ秒

## フレームワーク側で見つかった問題

AI-DLC の type-check センサー（PostToolUse フック）が、新しく置いた `dashboard/tsconfig.json` を基準に出力先を決め、`dashboard/aidlc/.../.tsbuildinfo` を書き出した。ダッシュボードのコードによる書き込みではない。`dashboard/.gitignore` に `aidlc/` を入れてコミットされないようにした。
