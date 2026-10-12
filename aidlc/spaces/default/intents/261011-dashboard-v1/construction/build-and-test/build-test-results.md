# ビルドとテストの結果: dashboard-v1

> 実行日時: 2026-10-11T06:32:13Z（Linux、bun 1.4.2）。手順は `build-instructions.md` と `unit-test-instructions.md`。

## ビルド

ビルド工程はない（bun が TypeScript を直接実行する）。型チェック `tsc --noEmit -p dashboard/tsconfig.json` はエラー 0 件。

## テスト

| 項目 | 結果 |
|------|------|
| 実行コマンド | `bun test dashboard` |
| 合計 | 80 |
| 成功 | 80 |
| 失敗 | 0 |
| スキップ | 0 |
| expect 呼び出し | 140 |
| 所要時間 | 約 3 秒 |

失敗はなかった。カバレッジは計測していない（Minimal）。

## 性能（NFR-005）

見本データを一時ディレクトリにコピーし、Intent を 51 件に増やして `LocalFsSource.listIntents()` を3回計測した。

| 回 | 時間 |
|----|------|
| 1回目 | 34.7 ms |
| 2回目 | 12.3 ms |
| 3回目 | 5.7 ms |

要件（Intent 10件で1秒以内）を十分に満たす。

## 実データでの起動確認

`bun dashboard/src/server.ts` をこのリポジトリに対して起動し、`/api/intents` が `261011-dashboard-v1` を「AI 作業中・Construction」として返すこと、`127.0.0.1` だけで待ち受けることを確認した。

## 反映速度（FR-030）

コード生成時に、見本データのコピーへ audit を1件追記してから画面のカードが変わるまでを Playwright で計測し、317 ms だった。
