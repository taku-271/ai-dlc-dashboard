# 要件定義: AI-DLC 並列 Intent ダッシュボード（v1）

> 上流: `ideation/intent-capture/intent-statement.md`（承認済み）、`inception/requirements-analysis/requirements-analysis-questions.md`（回答済み）
> scope-document（scope-definition ステージ）と team-practices（practices-discovery ステージ）は、poc スコープでステージ自体を実行しないため存在しない。範囲の判断は intent-statement の「スコープの方針」と質問票の回答をもとにする。
> business-overview・architecture・code-structure（reverse-engineering ステージ）も、greenfield の poc では作られないため参照していない。センサー `upstream-coverage` がこの3つを未参照と指摘するが、存在しない成果物なので対応不要。

## 意図の分析

並列で進めている 4〜6 件の Intent を一画面で見渡し、「今、人がボールを持っている Intent」をすぐに見つけられるようにする（intent-statement の成功指標「一画面で、今動いているすべての Intent とその状態がわかる」）。

v1 は質問1の回答（「最小で、一覧画面だけで良い」）に従い、**一覧画面だけ**を作る。詳細画面、差分レビュー、判断の下書き生成は v1 の範囲外。

## データ取得可否の調査結果

このリポジトリの `aidlc/` 配下の実ファイルとエンジン（`.claude/tools/`、`.claude/knowledge/`）を読んで調べた。依頼文で参照していた `docs/guide/10-state-and-audit.md` と `docs/guide/14-artifacts-reference.md` は、このリポジトリに存在しなかった。代わりに `.claude/knowledge/aidlc-shared/audit-format.md` とエンジンのソースを根拠にしている。

### ファイル構成

| パス | 内容 | git |
|------|------|-----|
| `aidlc/spaces/<space>/intents/intents.json` | Intent の一覧（`uuid`、`slug`、`dirName`、`scope`、`status`）。調査時点では `repos` フィールドが書かれていなかった | 追跡 |
| `<record>/aidlc-state.md` | Markdown の状態ファイル。`**キー**: 値` 形式の欄と、ステージごとのチェックボックス | 追跡 |
| `<record>/audit/<host>-<clone>.md` | イベントログ。`## 見出し` と `**Timestamp**` `**Event**` `**Stage**` などの欄が `---` で区切られて並ぶ。マシンごとに別ファイル（シャード）になる | 追跡 |
| `<record>/<phase>/<stage>/*.md` | 各ステージの成果物、質問票（`*-questions.md`）、`memory.md` | 追跡 |
| `<record>/runtime-graph.json` | ステージごとの開始・完了時刻と結果を集計したもの（エンジンが生成） | 無視 |
| `aidlc/spaces/<space>/intents/active-intent` | このクローンで今アクティブな Intent | 無視 |

（`<record>` は `aidlc/spaces/<space>/intents/<dirName>/`）

### 取得可否

| 欲しい情報 | 判定 | 取得元と判定方法 |
|------------|------|------------------|
| 現在のフェーズ・ステージ | 取得可 | `aidlc-state.md` の `**Current Stage**` と `**Lifecycle Phase**`。フェーズごとの進み具合はチェックボックスの集計で出す。`## Phase Progress` 欄は更新されずに古い値が残ることを確認したため使わない |
| 承認ゲートで人の返答待ち | 取得可（条件付き） | 現在ステージのチェックボックスが `[?]`。エンジンがゲートを開く操作（`gate-start`）は省略できる。省略されると返答待ちでも `[-]` のままになり、ファイルからは見分けられない |
| 質問への回答待ち | 取得可 | 現在ステージのディレクトリにある `*-questions.md` に、値が空の `[Answer]:` 行が残っている |
| 差し戻し | 取得可 | チェックボックス `[R]` と、audit の `GATE_REJECTED`／`STAGE_REVISING`。差し戻し後は AI が直している状態なので、ボールは AI 側 |
| 失敗による停止 | 取得可 | audit の `BOLT_FAILED`／`SWARM_UNIT_FAILED`。その後に `STAGE_STARTED` や `SESSION_RESUMED` がなければ、停止したまま。`ERROR_LOGGED` はツールのコマンドが失敗するたびに記録され、AI がその場でやり直すことも多いので、停止の判定には使わない |
| 放置 | 取得可 | 現在ステージが `[-]` のまま、audit の最後のセッション系イベントが `SESSION_ENDED` |
| 検証ゲートの結果 | ほぼ取得不可 | フェーズ境界の検証は audit に `PHASE_VERIFIED` が書かれるだけで、合否も報告ファイルもない（poc では実際に報告ファイルが生成されなかった）。センサーの結果は `SENSOR_FAILED` で取れるが、助言扱いで作業は止まらない |
| 待ち時間 | 取得可 | 承認待ちは直近の `STAGE_AWAITING_APPROVAL` の時刻から。回答待ちと放置は、直近の `STAGE_STARTED` や `SESSION_ENDED` の時刻から |
| 担当エージェント | 取得可 | `aidlc-state.md` の `**Active Agent**` |
| 最終更新 | 取得可 | `aidlc-state.md` の `**Last Updated**`。audit の最新イベントの時刻と比べ、新しいほうを使う |
| 完了 | 取得可 | `intents.json` の `status` が `complete`（エンジンの `aidlc-state.ts` で確認）、または audit の `WORKFLOW_COMPLETED` |
| 一時停止 | 取得可 | audit の `WORKFLOW_PARKED`（その後に `WORKFLOW_UNPARKED` がない） |
| AI が置いた仮定の一覧 | **取得不可** | 決まった書式がない。成果物の本文に散らばっている |
| 要件・ストーリーの ID とトレーサビリティ | **取得不可** | 書式の例（`FR-001`）が手引きにあるだけで、強制されていない。poc スコープではストーリーや設計の成果物自体が作られない |

### `/aidlc intent --json` とファイル直読みの比較

- `bun .claude/tools/aidlc-utility.ts intent --json` が返すのは、`intents.json` の内容（`uuid`、`slug`、`status`、`repos`、`dirName`）と、どれがアクティブかだけだった。ステージ、ゲート、待ち時間の情報は含まれない。
- エンジンの CLI には、実行するとファイルを書き出す処理が含まれている（例: `aidlc-runtime.ts` は `runtime-graph.json` を書く）。どのサブコマンドが書かないかは、エンジンの版によって変わりうる。
- **結論: ファイルを直接読む。** ダッシュボードはエンジンの CLI を一切呼ばない。これで「`aidlc/` と `.claude/` に書き込まない」を構造的に守れる。エンジンの書式が変わったときに追従が必要になる点は受け入れる（パーサーをテストで固定する）。

### 取得不可の情報の代替案（v1 では作らない）

- **AI の仮定**: 成果物に「仮定」用の見出しと箇条書きの書式を決め、プロジェクトのルール（`aidlc/spaces/default/memory/project.md`）に追加する。ルールの追加は、AI-DLC の学びの仕組み（§13）を通して人が承認する。
- **トレーサビリティ**: 要件に `FR-xxx` 形式の ID を付けることを同じくルール化し、下流の成果物から ID を参照してもらう。参照の有無は機械的に数えられる。
- **検証ゲートの結果**: 合否が記録されるようになるまでは、「取得不可」と表示する。

## 機能要件

### 状態判定（ボールを持っているのは誰か）

各 Intent の状態を、次の優先順で1つに決める。

| ID | 状態 | ボール | 判定条件 |
|----|------|--------|----------|
| FR-001 | 完了 | なし | `intents.json` の `status` が `complete`、または audit に `WORKFLOW_COMPLETED` がある |
| FR-002 | 一時停止 | なし | 直近の `WORKFLOW_PARKED` の後に `WORKFLOW_UNPARKED` がない |
| FR-003 | ブロック（失敗で停止） | 人 | 直近の `BOLT_FAILED`／`SWARM_UNIT_FAILED` の後に、`STAGE_STARTED`／`SESSION_RESUMED`／`GATE_APPROVED` がない |
| FR-004 | ブロック（未回答の質問） | 人 | 現在ステージのディレクトリにある `*-questions.md` に、値が空の `[Answer]:` 行がある。件数も数える |
| FR-005 | 承認待ち | 人 | 現在ステージのチェックボックスが `[?]` |
| FR-006 | ブロック（放置） | 人 | 現在ステージが `[-]` で、audit の最後のセッション系イベント（`SESSION_STARTED`／`SESSION_RESUMED`／`SESSION_ENDED`）が `SESSION_ENDED` |
| FR-007 | AI 作業中 | AI | 上記のどれにも当てはまらない、未完了の Intent（`[-]` または `[R]`） |

- FR-009: audit のイベントは、全シャードを読んで時刻順に並べる。時刻が同じイベントは、同じシャード内ではファイル内の順を保ち、シャードの間ではファイル名の順で並べる。FR-002／FR-003／FR-006 の「直近」「最後」はこの順序で決める。
- FR-008: ファイルが壊れている、または判定に必要な欄がない場合は、状態を推測せず「取得不可」とし、理由（どのファイルのどの欄か）を表示する。

### 一覧画面

- FR-010: 上段に件数のサマリーを表示する。項目は「承認待ち」「ブロック」「AI 作業中」「完了」。「一時停止」と「取得不可」が1件以上あれば、その件数も表示する。
- FR-011: 中段に「今あなたが見るべきもの」リストを表示する。対象はボールが人にある Intent（承認待ち・ブロック）だけ。
- FR-012: リストの並び順は影響の大きさで決める。①ブロック、②Ideation／Inception の承認待ち、③Construction 以降の承認待ち。同じ順位の中では、待ち時間が長いものを上にする。
- FR-013: Ideation／Inception の承認待ちには「影響大」タグを付ける。
- FR-014: リストの各行に「何を見ればいいか」を一言で表示する。例:「requirements-analysis の承認（成果物2件）」「未回答の質問 3件」「失敗で停止: <`BOLT_FAILED` の `Error summary` 欄、または `SWARM_UNIT_FAILED` の `Reason` 欄>」「セッション終了から 2時間 放置」。
- FR-015: リストの各行に待ち時間を表示する。起点は、承認待ちが直近の `STAGE_AWAITING_APPROVAL`、未回答の質問が現在ステージの直近の `STAGE_STARTED`、放置が直近の `SESSION_ENDED`、失敗で停止がその失敗イベントの時刻。起点のイベントが見つからない場合は「取得不可」と表示する。
- FR-016: 下段に全 Intent のカードを表示する。各カードに次を表示する。
  - Intent 名（`slug`）と記録ディレクトリ名（`dirName`）
  - 状態バッジ
  - 5フェーズ（Initialization／Ideation／Inception／Construction／Operation）の進捗バー。各ステージが実行対象かどうかは、`aidlc-state.md` のチェックボックス行の末尾（`— EXECUTE` か `— SKIP`）で判定する。フェーズごとに、分母を実行対象のステージ数、分子を `[x]` の数とする。実行対象のステージが0件のフェーズは「対象外」と表示する
  - 現在ステージ
  - 担当エージェント
  - 最終更新
  - 担当者
- FR-017: 状態の色は、ボールを持っているのが誰かで決める。人待ち（承認待ち・ブロック）だけを目立つ色にし、AI 作業中は落ち着いた色、完了と一時停止は控えめな色にする。
- FR-018: 取得できなかった項目は、空欄や推測値ではなく「取得不可」と表示する。

### 担当者とフィルタ（チーム展開への備え）

- FR-020: すべての Intent に「担当者」フィールドを持たせる。v1 では常に「あなた」とする。
- FR-021: 「今あなたが見るべきもの」リストは、内部的には「担当者 = 自分」のフィルタとして実装する。フィルタを外せば全員分が出る構造にする（v1 の画面にはフィルタ切り替えを出さない）。

### 自動更新

- FR-030: `aidlc/` 配下のファイル変更を監視し、変更から5秒以内に画面に反映する。ブラウザの再読み込みは不要にする。
- FR-031: ファイル監視の開始が例外で失敗した場合は、2秒間隔の再読み込みに切り替え、画面に「ポーリングで更新中」と表示する。

### 起動

- FR-040: リポジトリのルートで `bun dashboard/src/server.ts` を実行すると起動し、ブラウザで開く URL を表示する。読む対象のリポジトリは `--root <パス>` で変えられる（省略時はカレントディレクトリ）。ポートは既定で 4173、`--port <番号>` で変えられる。ポートが使用中なら、その旨を表示して終了する（別のポートを勝手に選ばない）。

## 非機能要件

- NFR-001（読み取り専用）: ダッシュボードは `aidlc/` と `.claude/` に一切書き込まない。エンジンの CLI も呼ばない。自動テストでは、見本データ（`dashboard/test/fixtures/`）を一時ディレクトリにコピーし、ダッシュボードの読み込みと監視を実行する前後で、ファイル一覧と内容のハッシュが変わらないことを確認する。実データは Claude のセッション中にフックが書き込むため、テスト対象にしない。
- NFR-002（ローカル完結）: 外部サービスへ通信しない。CDN も使わない。サーバーは `127.0.0.1` だけで待ち受ける。
- NFR-003（対応環境）: macOS／Linux／WSL で、bun だけで動く。
- NFR-004（反映速度）: ファイル変更から画面反映まで5秒以内（FR-030）。
- NFR-005（性能）: Intent 10件で、一覧の再計算が1秒以内に終わる。
- NFR-006（テスト）: 主要なパース処理（`aidlc-state.md`、audit、`intents.json`、質問票）と状態判定に自動テストがある。各処理について、正常系と、壊れた入力・欄がない入力などの異常系を2件以上含める。
- NFR-007（構造の分離）: データ取得層（ファイルを読んで Intent の一覧を返す部分）を画面から分離する。将来 git 経由で複数人分を読む実装に差し替えられるよう、インターフェースを1つに絞る。
- NFR-008（保存先）: v1 はダッシュボード自身のデータを保存しない。v2 以降で保存するときは `aidlc/` の外に置く。

## 制約

- 承認・差し戻しは Claude Code の会話内で行う。ダッシュボードから AI-DLC の状態を変更する機能は作らない。
- 技術スタックは Bun + TypeScript（質問3の回答）。サーバーは Bun の標準機能、画面は素の HTML／CSS／TypeScript、更新通知は Server-Sent Events、テストは `bun test`。外部の実行時依存は追加しない。
- アプリのコードは `aidlc/` の外、リポジトリ直下の `dashboard/` に置く。

## 仮定

- 仮定1: 1つの Intent の audit は、マシンごとの複数ファイル（シャード）に分かれることがある。すべてのシャードを読み、時刻順に並べ直して扱う。
- 仮定2: 読む対象は、当面 `default` スペースを含むすべてのスペースとする（このリポジトリには `default` しかない）。
- 仮定3: 動作確認には見本データ（質問4の回答）を使う。承認待ち、ブロック3種、AI 作業中、完了、一時停止を含む 6件ほどの見本 Intent を `dashboard/test/fixtures/` に置き、自動テストと画面確認の両方に使う。実データ（この Intent）でも確認する。

## 範囲外

- 詳細画面（ブロック時の詳細、承認待ちの差分レビュー）と、AI の仮定・上流から辿れない追加・抜け候補の3区分
- 判断の下書き生成、クリップボードへのコピー、確認範囲の記録（v2）
- ダッシュボードからの直接承認、チーム向けビュー（v3）
- 複数リポジトリ、複数の git worktree の集約
- 担当者フィルタの画面上での切り替え

## 実装計画

コード生成ステージで、次の順に作る。

0. 起動コマンド: `bun dashboard/src/server.ts [--root <パス>] [--port <番号>]`、テスト: `bun test dashboard`
1. `dashboard/src/parse/`: パーサー（`aidlc-state.md`、audit シャード、`intents.json`、質問票）と、そのテスト
2. `dashboard/src/model/`: 状態判定（FR-001〜008）、並び順（FR-012）、一言表示（FR-014）、フェーズ進捗の計算と、そのテスト
3. `dashboard/src/source/`: データ取得層。インターフェース `IntentSource` と、ローカルのファイルを読む実装
4. `dashboard/src/server.ts`: Bun のサーバー。`/api/intents`（JSON）、`/events`（SSE）、静的ファイル。ファイル監視と、監視が使えないときのポーリング
5. `dashboard/public/`: 一覧画面（HTML／CSS／TS）
6. 見本データと、読み取り専用を確かめるテスト（NFR-001）

ビルドとテストのステージで、`bun test` の全件成功、見本データと実データでの画面表示、読み取り専用テストの成功を確認する。

## 未解決の事項

- 承認ゲートを開く操作が省略された場合（FR-005 の限界）を見分ける手段はない。AI-DLC の運用で `gate-start` を必ず実行してもらうことを、後でルール化するか検討する。
