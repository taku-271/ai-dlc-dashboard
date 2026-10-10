# Project-Level Rules

> Project-specific overrides and corrections. Overrides aidlc-team.md
> and aidlc-org.md. Populated by practices-discovery and the
> self-learning loop.
>
> Use sparingly: most teams don't need a project layer. Reach for it
> only when this specific project deviates from team-wide practice in a
> stable, durable way (e.g., "this monorepo project rebases even though
> our team default is squash"; "this legacy project skips the test
> floor because the existing suite is unsalvageable and we accept
> that").

## Way of Working

<!-- Project-specific override. Example: -->
<!-- This monorepo project rebases instead of squash-merging because -->
<!-- the per-package commit history is the audit trail we depend on -->
<!-- for partial-rollback decisions. Override applies to this project -->
<!-- only. -->

## Walking Skeleton

<!-- Project-specific override. Example: -->
<!-- This project skips the walking skeleton because we're rewriting -->
<!-- an existing service in-place — there's no greenfield bootstrap -->
<!-- to gate. -->

## Testing Posture

<!-- Project-specific override. -->

## Deployment

<!-- Project-specific override. -->

## Code Style

<!-- Project-specific override. -->

## Tech Stack

<!-- Technology choices locked for this project. -->

## Decided

<!-- Decisions made in earlier stages that should not be re-asked. -->
<!-- Format: DECIDED: [decision] (Stage [slug], [date]) -->

- 複数プロジェクト（別リポジトリ）の横断表示は将来要件だが、MVPのデータモデルとUIは複数プロジェクト前提で設計する（表示階層: プロジェクト → Space → Intent → ステージ） (learned 2026-10-03) <!-- cid:intent-capture:c4 -->
- タブタイトルの承認待ち件数と承認待ち一覧は、全プロジェクト横断の合計／一覧として扱う (learned 2026-10-03) <!-- cid:intent-capture:c5 -->
- 監視対象プロジェクトはダッシュボード側の設定ファイルのみで指定する（当初要件のパス引数・カレントディレクトリによる指定は設けない） (learned 2026-10-03) <!-- cid:intent-capture:c6 -->
- ダッシュボードへの変更の伝達は、ユーザー全体の設定に置いた Claude Code のフックによる自動の合図とファイルの読み直しで行い、MCP は使わない（ファイル監視は OS 差、MCP は送り忘れとファイルとのずれのため不採用） (learned 2026-10-04) <!-- cid:feasibility:c6 -->
## Scope Overrides

<!-- Custom scope rules for this project. -->

## Forbidden

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: NEVER [behavior] (affirmed [date]) -->
<!-- Example: NEVER throw exceptions across service layer boundaries (affirmed 2026-05-17) -->

## Mandated

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: ALWAYS [behavior] (affirmed [date]) -->
<!-- Example: ALWAYS use Result<T,E> for fallible operations in service layer (affirmed 2026-05-17) -->
ALWAYS ユーザーへの応答・説明・進捗報告・承認ゲートや質問（AskUserQuestion の question / header / options の label と description を含む）は日本語で行う (affirmed 2026-10-04)
ALWAYS 各ステージが生成するドキュメント成果物（要件定義、ユーザーストーリー、設計書、ADR など）の本文と見出しは日本語で記述する (affirmed 2026-10-04)
ALWAYS 機械可読な要素は英語のまま維持する：ファイル名・ディレクトリ名、stage slug、CLI フラグと引数値（例: `--result approved`、`--scope feature`）、YAML/frontmatter のキー、コード識別子、ツールへ渡す enum 値 (affirmed 2026-10-04)
ALWAYS ツールが出力する英語メッセージ（`print` / `error` ディレクティブ）は原文のまま表示し、必要に応じて日本語の補足を添える (affirmed 2026-10-04)

## Corrections

<!-- Project-specific corrections from human feedback. -->
<!-- Format: NEVER/ALWAYS [behavior] (learned [date]) -->
- 質問票では、要件文で既に明確な項目は再質問せず、問題の大きさ・成功指標・利用文脈・前提の妥当性など未確定の点に絞って質問する (learned 2026-10-03) <!-- cid:intent-capture:c1 -->
- 質問への回答途中で要件が変わったときは、影響を受けない回答済みの質問は維持し、影響を受ける未回答の質問だけを作り直す（改訂前の質問は質問票に参考として残す） (learned 2026-10-03) <!-- cid:intent-capture:c7 -->
- 実現可能性の判断は机上の調査だけで済ませず、作業用ディレクトリ（scratchpad）で実際に試して証拠を残す（監視対象の aidlc/・.claude/ には書き込まない） (learned 2026-10-04) <!-- cid:feasibility:c5 -->
- ALWAYS scope-definition で範囲と期間を検証するときは、期間だけでなく開発者が使える時間（1日あたりの作業時間）と、期間に対する Must の量も質問して確認する (learned 2026-10-10) <!-- cid:scope-definition:c5 -->
- ALWAYS 前のステージまでの決定で大半が確定しているときは、全項目を一から質問せず叩き台を示して承認を得たうえで、判断の分かれる点だけを個別に質問する (learned 2026-10-10) <!-- cid:scope-definition:c6 -->
