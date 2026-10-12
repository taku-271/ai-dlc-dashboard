# ビルドとテストのまとめ: dashboard-v1

> 上流: `construction/dashboard-v1/code-generation/code-generation-plan.md`、`construction/dashboard-v1/code-generation/code-summary.md`

## 全体の状態

- ビルド: 不要（bun で直接実行）。型チェックはエラー 0 件
- テスト: 80 件すべて成功（`build-test-results.md`）
- 性能: Intent 51 件で一覧の再計算が 35 ms 以内

## 作成したテスト手順

テスト戦略が Minimal のため、作成したのは次の2つだけ。

- `build-instructions.md`: 起動方法とトラブルシューティング
- `unit-test-instructions.md`: テストの実行方法と、要件との対応表

結合テスト（見本データでの通し確認、変更通知、サーバー）と読み取り専用のテストは、単体テストと同じ `bun test dashboard` に含まれている。性能とセキュリティの専用の手順書は作っていない（Minimal）。性能は `build-test-results.md` に1回分の計測を記録した。

## 準備状況

| 観点 | 状態 |
|------|------|
| ビルド | 準備完了 |
| テスト | 準備完了 |
| 利用開始 | 準備完了。あとは依頼者が手元の実データで画面を確認する |

## 既知の制限と残課題

`dashboard/README.md` の「既知の制限（v1）」に記載した。要点は次のとおり。

- Intent を切り替えると、切り替え前の Intent が「AI 作業中」と表示され続ける
- AI-DLC 側で承認ゲートを開く操作が省略されると、承認待ちを見分けられない
- swarm の一部ユニットが失敗したとき、別ユニットが動き出すと「失敗で停止」が解除される
- macOS と WSL での動作は未確認
- 実行中にファイル監視が失敗した場合の、ポーリングへの切り替えにはテストがない（開始時の失敗はテスト済み）
