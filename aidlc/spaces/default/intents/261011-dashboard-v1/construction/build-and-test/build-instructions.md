# ビルド手順: dashboard-v1

> 上流: `construction/dashboard-v1/code-generation/code-generation-plan.md`、`construction/dashboard-v1/code-generation/code-summary.md`

## 前提

- bun 1.4 以上（AI-DLC と同じ前提。`curl -fsSL https://bun.sh/install | bash`）
- 対応 OS: macOS／Linux／WSL（確認済みは Linux のみ）
- 実行時の依存パッケージはない。ビルド（バンドル・トランスパイル）も不要

## 起動

```
git checkout claude/wizardly-rubin-u6fdza
bun dashboard/src/server.ts                       # このリポジトリの aidlc/ を読む
bun dashboard/src/server.ts --root <別のリポジトリ> # 読む対象を変える
bun dashboard/src/server.ts --port 4180           # ポートを変える（既定 4173）
```

起動すると `http://127.0.0.1:4173` を表示する。ブラウザで開く。

## 型チェック（任意）

```
cd dashboard && bun install   # 開発用の型定義 @types/bun だけを入れる
tsc --noEmit -p tsconfig.json
```

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| 「ポート 4173 は使用中です」と出て終わる | `--port` で別の番号を指定する |
| 画面に「ポーリングで更新中」と出る | ファイル監視が使えない環境。2秒間隔で更新するので動作に支障はない |
| 一覧が空 | `--root` の指す場所に `aidlc/spaces/*/intents/intents.json` があるか確認する |
