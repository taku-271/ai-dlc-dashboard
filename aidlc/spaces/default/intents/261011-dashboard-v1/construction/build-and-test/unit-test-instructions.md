# 単体テスト手順: dashboard-v1

> 上流: `construction/dashboard-v1/code-generation/code-summary.md`。テスト戦略は Minimal（要件ごとに1件以上）。

## 実行方法

```
bun test dashboard                 # 全件
bun test dashboard/test/parse      # パーサーだけ
bun test dashboard/test/model      # 状態判定と表示モデルだけ
```

テストフレームワークは bun 内蔵の `bun:test`。設定ファイルは不要。

## テストの構成と要件の対応

| ファイル | 対象 | 主な要件 |
|----------|------|----------|
| `test/parse/registry.test.ts` | `intents.json` の読み込み、壊れた JSON | FR-001、FR-008 |
| `test/parse/state.test.ts` | 状態ファイルの欄とステージ行 | FR-005〜FR-007、FR-016 |
| `test/parse/audit.test.ts` | audit の分割、複数シャードの並べ替え | FR-009 |
| `test/parse/questions.test.ts` | 未回答の `[Answer]:` の数え方 | FR-004 |
| `test/model/status.test.ts` | 状態判定の優先順、`ERROR_LOGGED` だけでは停止にしない | FR-001〜FR-008 |
| `test/model/view.test.ts` | サマリー、並び順、影響大タグ、一言表示、担当者フィルタ | FR-010〜FR-021 |
| `test/source.test.ts` | 見本データでの結合、変更通知、ポーリングへの切り替え | FR-030、FR-031、NFR-007 |
| `test/server.test.ts` | API、SSE、Host ヘッダーの検査、ポート使用中 | FR-040、NFR-002 |
| `test/readonly.test.ts` | 読み込み・監視の前後でファイルが変わらないこと、書き込み API がないこと | NFR-001 |

## テストデータ

見本データは `dashboard/test/fixtures/repo/`（Intent 9件、スペース2つ）。テストは一時ディレクトリにコピーしてから使うため、見本データ自体は書き換わらない。

## 目標

全件成功。カバレッジの数値目標は置かない（poc／Minimal）。
