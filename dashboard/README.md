# AI-DLC ダッシュボード（v1）

リポジトリ内のすべての AI-DLC Intent を一画面で見渡し、「今、人がボールを持っている Intent」をすぐに見つけるためのローカル Web ダッシュボードです。

## 起動

リポジトリのルートで実行します。

```sh
bun dashboard/src/server.ts                    # カレントディレクトリの aidlc/ を読む
bun dashboard/src/server.ts --root ../other    # 別のリポジトリを読む
bun dashboard/src/server.ts --port 5000        # ポートを変える（既定 4173）
```

表示された URL（`http://127.0.0.1:4173`）をブラウザで開きます。ポートが使用中のときは、その旨を表示して終了します（別のポートを勝手に選びません）。

見本データで画面を確認するには、見本を一時ディレクトリにコピーしてから `--root` で指定します。

```sh
cp -r dashboard/test/fixtures/repo /tmp/aidlc-fixture
bun dashboard/src/server.ts --root /tmp/aidlc-fixture
```

## テスト

```sh
bun test dashboard                          # リポジトリのルートから
cd dashboard && bun install && bun run typecheck   # 型チェック（@types/bun と tsc が必要）
```

実行時の依存はありません。`@types/bun` は型チェック用の開発依存です。

## 読み取り専用であること

- ダッシュボードは `aidlc/` と `.claude/` に一切書き込みません。使うのは `readFile`／`readdir`／`stat`／`watch` だけです。
- AI-DLC エンジンの CLI（`.claude/tools/*`）は呼びません。承認・差し戻しは Claude Code の会話内で行ってください。
- サーバーは `127.0.0.1` だけで待ち受け、外部へは通信しません（CDN も使いません）。
- 自動テスト（`test/readonly.test.ts`）で、読み込み・監視・配信の前後でファイル一覧とハッシュが変わらないこと、ソースに書き込み系 API がないことを確認しています。

## 「取得不可」の意味

ファイルが壊れている、または判定に必要な欄がないときは、状態や値を推測せず「取得不可」と表示します。カードには理由（どのファイルのどの欄か）を表示し、画面上の「取得不可」にマウスを重ねると理由が出ます。

例:
- `aidlc-state.md` に `Current Stage` 欄がない → 状態は「取得不可」
- 承認待ちなのに audit に `STAGE_AWAITING_APPROVAL` がない → 待ち時間は「取得不可」
- `intents.json` が JSON として読めない → そのスペースは「取得不可」の1行になる

## 状態の判定（優先順）

| 状態 | ボール | 条件 |
|------|--------|------|
| 完了 | なし | `intents.json` の `status` が `complete`、または `WORKFLOW_COMPLETED` |
| 一時停止 | なし | 直近の `WORKFLOW_PARKED` の後に `WORKFLOW_UNPARKED` がない |
| ブロック（失敗で停止） | 人 | 直近の `BOLT_FAILED`／`SWARM_UNIT_FAILED` の後に `STAGE_STARTED`／`SESSION_RESUMED`／`GATE_APPROVED` がない |
| ブロック（未回答の質問） | 人 | 現在ステージの `*-questions.md` に空の `[Answer]:` 行がある |
| 承認待ち | 人 | 現在ステージが `[?]` |
| ブロック（放置） | 人 | 現在ステージが `[-]` で、最後のセッション系イベントが `SESSION_ENDED` |
| AI 作業中 | AI | 上記以外で、現在ステージが `[-]`／`[R]`／`[x]` |

`ERROR_LOGGED` だけでは停止とみなしません（AI がその場でやり直すことが多いため）。`## Phase Progress` 欄は古い値が残るため使わず、フェーズ進捗はステージのチェックボックスから数えます。

## 自動更新

`aidlc/` 配下を再帰的に監視し、変更を Server-Sent Events（`/events`）でブラウザに通知します。監視を開始できない環境では2秒間隔のポーリングに切り替え、画面上部に「ポーリングで更新中」と表示します。

## 既知の制限（v1）

- **Intent を切り替えた後の「AI 作業中」**: 会話の中で `/aidlc intent <別の Intent>` に切り替えると、切り替え前の Intent には `SESSION_ENDED` も `WORKFLOW_PARKED` も記録されない。そのため、誰も作業していなくても「AI 作業中」と表示され続ける。
- **承認ゲートを開く操作の省略**: AI-DLC 側で `gate-start` が省略されると、承認待ちでもステージは `[-]` のままになり、「AI 作業中」または「放置」と表示される。
- **swarm の一部ユニットの失敗**: 失敗したユニットとは別のユニットで `STAGE_STARTED` が記録されると、「失敗で停止」が解除される（ユニット単位で突き合わせていない）。
- **ユニットごとのステージの件数**: `construction/<unit>/<stage>/` のように分かれたステージでは、未回答の質問と成果物の件数を全ユニット分で合算する。
- **確認済みの環境**: Linux でのみ確認した。macOS と WSL では未確認。

## 構成

```
dashboard/
  src/
    types.ts            データの型
    parse/              intents.json・aidlc-state.md・audit シャード・質問票のパーサー
    model/              状態判定（status.ts）と表示モデル（view.ts）
    source/             データ取得層（IntentSource インターフェースと LocalFsSource）
    server.ts           Bun サーバー（/api/intents、/events、静的ファイル）
  public/               一覧画面（ビルド不要の HTML／CSS／JS）
  test/                 bun test（fixtures/repo が見本データ）
```

データ取得層は `IntentSource` の1つのインターフェースに絞ってあり、将来 git 経由で複数人分を読む実装に差し替えられます。
