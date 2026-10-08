<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is maintained by the orchestrator during stage execution. Add observations at the gate ritual, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-10-03T15:25:54Z — 要件文で既に明確な項目は再質問せず、質問を6問（問題の大きさ・成功指標・利用文脈・監視範囲・待ちの定義・利用者範囲）に絞った; Standard深度の目安5-8問の範囲内。要件文が非常に具体的なため、ステージ例示の4観点のうち「誰が顧客か」「なぜ今か」は要件文から推定し、確認は成功指標と前提の妥当性に重点を置いた。
- 2026-10-03T15:33:36Z — 要件変更（Markdown出力→ローカルWebアプリ、リアルタイム反映、タブタイトルに承認待ち件数、127.0.0.1限定）を「現ステージ内の変更」として扱った; 最初のステージで承認済み成果物がなくスコープ（mvp）も不変のため、stage-protocol-recovery §7 の Minor change に該当。質問票と今後の成果物に反映し、ルーティングは変えない。
- 2026-10-03T15:33:36Z — 要件文のうち変更指示で触れられていない項目（対象ディレクトリをパス引数で指定・省略時はカレント、受け入れ基準3点、データソース、bun+TypeScript、外部通信なし、壊れたファイルで落ちない）は維持と解釈した; 「MVP後に検討」にあった「ローカルWeb画面化、自動更新」はMVPへ繰り上げ、Markdown（DASHBOARD.md）出力は廃止と解釈。
- 2026-10-03T15:34:40Z — 追加要件（複数プロジェクト対応）を「将来要件だがMVPのデータモデルとUIの前提」として扱った; Q4 は追加要件から回答を導出して記入（将来＝複数リポジトリ横断、各リポジトリ内は複数Space×複数Intent）。最終確認は回答のまとめで行う。
- 2026-10-03T15:34:40Z — タブタイトルの承認待ち件数・承認待ち一覧は、全プロジェクト横断の合計／一覧と解釈した; 追加要件「承認待ち一覧は全プロジェクト横断で1つにまとめる」と整合させるため。
- 2026-10-03T15:39:01Z — Q8=A（設定ファイルのみ）により、当初要件「対象ディレクトリをパス引数で指定、省略時カレント」は設定ファイル指定に置き換わると解釈した; 回答のまとめで確認する。

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-10-03T15:33:36Z — 回答済みの Q1・Q2 は維持し、未回答の Q3 を作り直して Q7 を追加した（旧Q3は質問票末尾に参考として保存）; 旧Q3の選択肢がMarkdown生成前提で、変更後の要件では意味をなさないため。

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-10-03T15:25:54Z — `[?]` は任意記録（aidlc-state.ts の gate-start が任意、reject/approve 時に監査行だけ後から補完される）; 状態ファイルだけでは承認待ちを取りこぼす可能性がある。ダッシュボードの中核価値に直結するため Q5 で定義を確認し、feasibility で監査ログからの補完可否を調べる。
- 2026-10-03T15:25:54Z — 実ファイル観察：aidlc-state.md の `- **Project**:` フィールドに要件文全体（`## ` 見出しを含む複数行）がそのまま入っている; 見出しベースの素朴なパーサーはセクション境界を誤認する恐れがある。監査シャードは `<record>/audit/` に加え Space 直下の `intents/audit/` にも存在する。
- 2026-10-03T15:33:36Z — `aidlc-state.md` の `**Project**` フィールドには変更前の要件文が残っている; 変更は intent-capture の質問票・成果物に記録した。下流ステージが Project フィールドだけを読むと旧要件（Markdown出力）を拾う恐れがあるため、intent-statement を正とする旨を成果物に明記する。
- 2026-10-03T15:33:36Z — 「127.0.0.1のみで待ち受け」だけでは、同じブラウザで開いた悪意あるWebページからのアクセス（DNSリバインディング等）は防げない; ダッシュボードは要件文や設計書の中身を返すため、feasibility / NFR で Host ヘッダー検証などの対策要否を確認する。
- 2026-10-03T15:33:36Z — 「数秒以内に自動反映」は測定可能な閾値になっていない; requirements-analysis で具体的な秒数（例：変更から表示まで5秒以内）に落とす。ファイル変更検知の方式（OS機能か定期確認か）の妥当性は feasibility で確認する。
- 2026-10-03T15:33:36Z — 外部ネットワーク通信をしない制約は、Web画面の表示に使うスクリプトやフォントを外部（CDN等）から読み込まないことも含むと解釈した; 要確認事項として requirements-analysis に持ち越す。
- 2026-10-03T15:34:40Z — 当初要件の「パス引数（省略時カレント）」と追加要件の「ダッシュボード側の設定ファイル」の関係が未確定; Q8 で確認する。設定ファイルの置き場所（ダッシュボードのリポジトリ内か、ホームディレクトリ配下か）は requirements-analysis 以降で決める。
- 2026-10-03T15:34:40Z — 複数リポジトリのファイル変更を同時に監視する方式の負荷・信頼性（監視対象数が増えたとき、リポジトリが移動・削除されたとき）は feasibility で確認する; 1プロジェクトの失敗を他へ波及させない（追加要件）ための分離もあわせて検討。
- 2026-10-03T15:39:01Z — 成功指標 Q2-B（承認待ち滞留時間の中央値）は、gate-start が省略されたゲートでは承認／差し戻し時に STAGE_AWAITING_APPROVAL が Recovered=true で後から補完されるため（aidlc-state.ts handleReject / report の補完処理）、監査ログ上の待ち時間がほぼ0になる; Q5=D（まず[?]のみ）と合わせ、指標の測定方法とベースラインの取り方は feasibility で確定する。intent-statement では前提付きの指標として記載する。
- 2026-10-03T15:42:46Z — `aidlc-learnings.ts surface` が日誌を0件と返した; runtime-graph.json の memory_path が Intent ディレクトリ抜きの `aidlc/spaces/default/intents/ideation/intent-capture/memory.md` になっている（aidlc-runtime.ts の relativeMemoryPath 呼び出しが recordPrefix を渡していない）ため。phase も `spaces` と誤判定。§13 の候補抽出は正しいパスの日誌から手作業で行い、保存は persist ツールに任せた。フレームワーク側の修正要否はユーザーに報告する。
