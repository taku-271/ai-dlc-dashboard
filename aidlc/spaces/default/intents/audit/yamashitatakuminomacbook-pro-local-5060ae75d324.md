# AI-DLC Audit Log

## Scope Detection
**Timestamp**: 2026-10-03T15:23:34Z
**Event**: SCOPE_DETECTED
**Detected scope**: feature
**Input text**: # AI-DLC 部長ダッシュボード 要件\n\n## 目的\nAI-DLC v2（aidlc-workflows v2ブランチ）をClaude Codeで運用する個人開発者が、\nAIエージェントたちの作業状況を一目で把握し、特に「自分の承認待ち」を\n取りこぼさないためのダッシュボードを作る。\n\n## 背景\n- 開発者は1人。AIエージェントは複数のIntentを並行して進められるが、\n  承認ゲートを通せるのは開発者だけなので、承認待ちが滞留しやすい。\n- `/aidlc --status` は作業単位の確認には使えるが、全Intentを横断した一覧がない。\n\n## データソース（読み取り専用）\n- `aidlc/spaces/<space>/intents/<intent>/aidlc-state.md`\n  - ステージ状態がチェックボックスで記録されている\n    （[ ]未着手 / [-]進行中 / [?]承認待ち / [R]修正中 / [x]完了 / [S]スキップ）\n- `aidlc/spaces/<space>/intents/<intent>/audit/`（追記型の監査ログ）\n- `aidlc/spaces/<space>/memory/`（team.md, project.md などのルール）\n\n**重要：上記ファイルの実際のフォーマットは推測せず、\nリポジトリ内の実ファイルとaidlc-workflowsのドキュメントを読んで確認すること。**\n\n## 機能要件（MVP）\n1. 承認待ち一覧：`[?]` のステージを全Intent横断で表示する。\n   Intent名、ステージ名、可能なら承認待ちになった日時を出す。最上部に配置。\n2. 修正中一覧：`[R]` のステージを表示する。\n3. Intent一覧：各Intentの現在ステージ、進捗（完了数／スキップを除く総数）、\n   最終更新日時を表示する。\n4. 複数Space対応：Spaceごとにグルーピングして表示する。\n\n## 機能要件（MVP後に検討）\n- ルール数の推移（memory配下のルール増加＝学習ループの成果）\n- セッションコストの表示（aidlc-session-cost スキルで取れる情報を調査）\n- ローカルWeb画面化、自動更新\n\n## 出力形式\n- MVPは1コマンドで実行し、Markdownファイル（例：DASHBOARD.md）を生成する。\n- 対象ディレクトリはパス引数で指定でき、省略時はカレントディレクトリ。\n\n## 非機能要件・制約\n- `aidlc/` と `.claude/` 配下には一切書き込まない\n  （状態の更新はAI-DLCのエンジンの責務のため）。\n- 外部ネットワーク通信をしない。\n- AI-DLCが前提としているbunで動くTypeScriptで実装する。\n- 壊れた・想定外の形式のファイルがあってもクラッシュせず、警告を出して続行する。\n\n## 受け入れ基準\n- Intentが0件でもエラーにならず「対象なし」と表示される。\n- テスト用のフィクスチャ（承認待ち・修正中・完了が混在する複数Intent）で\n  一覧が正しく出ることをテストで確認できる。\n- 実際のプロジェクトで実行し、`/aidlc --status` の内容と矛盾しない。\n\n## スコープ外\n- 承認操作をダッシュボードから行うこと（承認は必ずClaude Code上で行う）\n- 通知（Slack等）
**Source**: freeform
**Matched keywords**: mvp

---
