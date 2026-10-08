# AI-DLC State Tracking

## Project Information
- **Project**: # AI-DLC 部長ダッシュボード 要件

## 目的
AI-DLC v2（aidlc-workflows v2ブランチ）をClaude Codeで運用する個人開発者が、
AIエージェントたちの作業状況を一目で把握し、特に「自分の承認待ち」を
取りこぼさないためのダッシュボードを作る。

## 背景
- 開発者は1人。AIエージェントは複数のIntentを並行して進められるが、
  承認ゲートを通せるのは開発者だけなので、承認待ちが滞留しやすい。
- `/aidlc --status` は作業単位の確認には使えるが、全Intentを横断した一覧がない。

## データソース（読み取り専用）
- `aidlc/spaces/<space>/intents/<intent>/aidlc-state.md`
  - ステージ状態がチェックボックスで記録されている
    （[ ]未着手 / [-]進行中 / [?]承認待ち / [R]修正中 / [x]完了 / [S]スキップ）
- `aidlc/spaces/<space>/intents/<intent>/audit/`（追記型の監査ログ）
- `aidlc/spaces/<space>/memory/`（team.md, project.md などのルール）

**重要：上記ファイルの実際のフォーマットは推測せず、
リポジトリ内の実ファイルとaidlc-workflowsのドキュメントを読んで確認すること。**

## 機能要件（MVP）
1. 承認待ち一覧：`[?]` のステージを全Intent横断で表示する。
   Intent名、ステージ名、可能なら承認待ちになった日時を出す。最上部に配置。
2. 修正中一覧：`[R]` のステージを表示する。
3. Intent一覧：各Intentの現在ステージ、進捗（完了数／スキップを除く総数）、
   最終更新日時を表示する。
4. 複数Space対応：Spaceごとにグルーピングして表示する。

## 機能要件（MVP後に検討）
- ルール数の推移（memory配下のルール増加＝学習ループの成果）
- セッションコストの表示（aidlc-session-cost スキルで取れる情報を調査）
- ローカルWeb画面化、自動更新

## 出力形式
- MVPは1コマンドで実行し、Markdownファイル（例：DASHBOARD.md）を生成する。
- 対象ディレクトリはパス引数で指定でき、省略時はカレントディレクトリ。

## 非機能要件・制約
- `aidlc/` と `.claude/` 配下には一切書き込まない
  （状態の更新はAI-DLCのエンジンの責務のため）。
- 外部ネットワーク通信をしない。
- AI-DLCが前提としているbunで動くTypeScriptで実装する。
- 壊れた・想定外の形式のファイルがあってもクラッシュせず、警告を出して続行する。

## 受け入れ基準
- Intentが0件でもエラーにならず「対象なし」と表示される。
- テスト用のフィクスチャ（承認待ち・修正中・完了が混在する複数Intent）で
  一覧が正しく出ることをテストで確認できる。
- 実際のプロジェクトで実行し、`/aidlc --status` の内容と矛盾しない。

## スコープ外
- 承認操作をダッシュボードから行うこと（承認は必ずClaude Code上で行う）
- 通知（Slack等）
- **Project Type**: Greenfield
- **Scope**: mvp
- **Start Date**: 2026-10-03T15:24:05Z
- **State Version**: 7
- **Active Agent**: aidlc-product-agent
- **Worktree Path**:
- **Bolt Refs**:
- **Practices Affirmed Timestamp**:

## Scope Configuration
- **Stages to Execute**: 0.1, 0.2, 0.3, 1.1, 1.3, 1.4, 1.6, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
- **Stages to Skip**: 1.2 (market-research), 1.5 (team-formation), 1.7 (approval-handoff), 4.1 (deployment-pipeline), 4.2 (environment-provisioning), 4.3 (deployment-execution), 4.4 (observability-setup), 4.5 (incident-response), 4.6 (performance-validation), 4.7 (feedback-optimization), 2.1 (reverse-engineering — greenfield)
- **Depth**: Standard
- **Test Strategy**: Standard

## Workspace State
- **Project Root**: /Users/takumi/Documents/dev/ai-dlc-dashboard
- **Languages**: Unknown
- **Frameworks**: Unknown
- **Build System**: Unknown

## Execution Plan Summary
- **Total Stages**: 21
- **Completed**: 5
- **In Progress**: scope-definition

## Runtime State
- **Revision Count**: 0

## Phase Progress
<!-- Status values: Pending, Active, Verified, Skipped -->

- **Initialization**: Active
- **Ideation**: Pending
- **Inception**: Pending
- **Construction**: Pending
- **Operation**: Skipped

## Stage Progress
<!-- Checkbox states: [ ] not started, [-] in progress, [?] awaiting approval (gate open), [R] revising (user rejected gate), [x] completed, [S] skipped via --stage/--phase jump -->

### INITIALIZATION PHASE
- [x] workspace-scaffold — EXECUTE
- [x] workspace-detection — EXECUTE
- [x] state-init — EXECUTE

### IDEATION PHASE
- [x] intent-capture — EXECUTE
- [ ] market-research — SKIP
- [x] feasibility — EXECUTE
- [?] scope-definition — EXECUTE
- [ ] team-formation — SKIP
- [ ] rough-mockups — EXECUTE
- [ ] approval-handoff — SKIP

### INCEPTION PHASE
- [ ] reverse-engineering — SKIP
- [ ] practices-discovery — EXECUTE
- [ ] requirements-analysis — EXECUTE
- [ ] user-stories — EXECUTE
- [ ] refined-mockups — EXECUTE
- [ ] application-design — EXECUTE
- [ ] units-generation — EXECUTE
- [ ] delivery-planning — EXECUTE

### CONSTRUCTION PHASE
Per unit: [TBD]
- [ ] functional-design — EXECUTE
- [ ] nfr-requirements — EXECUTE
- [ ] nfr-design — EXECUTE
- [ ] infrastructure-design — EXECUTE
- [ ] code-generation — EXECUTE
- [ ] build-and-test — EXECUTE
- [ ] ci-pipeline — EXECUTE

### OPERATION PHASE
- [ ] deployment-pipeline — SKIP
- [ ] environment-provisioning — SKIP
- [ ] deployment-execution — SKIP
- [ ] observability-setup — SKIP
- [ ] incident-response — SKIP
- [ ] performance-validation — SKIP
- [ ] feedback-optimization — SKIP

## Current Status
- **Lifecycle Phase**: IDEATION
- **Current Stage**: scope-definition
- **Next Stage**: rough-mockups
- **Status**: Running
- **Last Updated**: 2026-10-08T01:46:33Z

## Session Resume Point
- **Last Completed Stage**: feasibility
- **Next Action**: Execute Scope Definition
- **Pending Artifacts**: none
