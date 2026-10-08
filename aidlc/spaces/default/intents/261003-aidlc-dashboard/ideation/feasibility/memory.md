<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is maintained by the orchestrator during stage execution. Add observations at the gate ritual, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-10-03T16:05:54Z — ステージ例示の質問（既存システム連携・規制・技術スタック・予算期間・組織要因・AWS）のうち、連携・技術スタック・AWS・組織要因は intent-statement と文脈から回答済み／該当なしと判断し質問しなかった; ローカル専用の個人ツールで、AWS は使わない。代わりに intent-statement の R-1〜R-6 を実ファイル・実機で検証し、その結果に基づく7問に絞った。
- 2026-10-03T16:05:54Z — aidlc-aws-platform-agent の視点は「クラウドを使わないことの確認」と「ローカル実行環境（OS・ランタイム）の実現性」に読み替えた; 対象がローカル専用ツールのため、AWS サービス選定・コスト見積りは該当しない。
- 2026-10-04T02:39:00Z — Q1 の自由記述「macもlinuxも windowsも、いろんなosいます」を選択肢 C（全OS対応）と解釈し、原文を併記した; 対応OSの範囲として一意に読めるため追加質問はしなかった。

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-10-04T02:39:00Z — 当初7問に、Q8（変更の伝え方）・Q9〜Q12（矛盾確認）の5問を追加し計12問になった; Q1 でユーザーが方式自体を問い直したことと、Q8=B・Q5=A・Q7=B が既存の決定と食い違ったため。Standard の目安（5〜8問）を超えたが、追加質問は深さにかかわらず許容される。

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-10-03T16:05:54Z — 机上の調査だけでなく、作業用ディレクトリ（scratchpad）で bun の再帰的ファイル監視と 127.0.0.1 待ち受け＋Host ヘッダー検証を実際に試した; 制約 C-6（推測せず実物で確認）に沿い、実現性の判断を証拠付きにするため。プロジェクトの aidlc/・.claude/ には書き込んでいない。
- 2026-10-04T02:39:00Z — 変更の伝え方を3方式で比較した: ファイル監視（決定的だがOS差あり）／Claude が MCP で送る（OS差なしだが送るかが LLM 次第で R-1 と同種の取りこぼしを再生産、内容がファイルとずれる）／Claude Code フックで合図＋ファイル再読込（決定的・OS差なし・ファイルが正）。ユーザーは当初 MCP を選んだが、矛盾確認で中心価値（取りこぼさない）と SM-1 との両立を示し、フック方式（Q9=C）に確定した。

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-10-03T16:05:54Z — `/aidlc --status` は進捗の総数に `[S]`（ジャンプでスキップ）を含める一方、ステータスライン（statusline）は除外すると手順書にあり、フレームワーク内で数え方が揃っていない; 当初要件「完了数／スキップを除く総数」の定義を requirements-analysis で確定する。
- 2026-10-03T16:05:54Z — ステージの表示名（例: Intent Capture & Framing）は状態ファイルには slug しかなく、表示名は .claude/ 側のステージグラフにある; 監視対象の .claude/ を読み取り専用で参照してよいか（データソースに含めるか）を requirements-analysis で確認する。
- 2026-10-03T16:05:54Z — Linux / Windows でのファイル監視は未検証（Q1 の回答次第で検証範囲が決まる）。
- 2026-10-04T02:39:00Z — AI-DLC 自身の Stop フックは作業継続のために応答終了を差し止めることがあり、ユーザー全体の Stop フックが受け取る「応答終了」が真の入力待ちとは限らない; F（入力待ち表示）の判定条件を requirements-analysis / functional-design で詰める。
- 2026-10-04T02:39:00Z — Claude Code の外で起きた変更（別クローンからの git pull、他のハーネス、手作業の編集）はフックでは拾えない; 起動時の全読込に加え、補完策（低頻度の再確認、手動更新ボタン等）を requirements-analysis で決める。
- 2026-10-04T02:39:00Z — ユーザー全体の設定（~/.claude/settings.json）へのフック登録を誰がどう行うか（手順書で手動、セットアップコマンド等）は未定; 他の Claude Code 利用への影響（フックの速度、ダッシュボード停止中の挙動）も含めて requirements-analysis で決める。
- 2026-10-04T02:39:00Z — OSS 公開時、AI-DLC 本体のコード（読み取りロジック等）を流用するならライセンスの確認が必要; 現時点では流用の予定なし。
