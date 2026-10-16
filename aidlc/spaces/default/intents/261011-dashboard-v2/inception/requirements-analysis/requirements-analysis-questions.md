# Requirements Analysis 質問票（v2）

実データで調べた結果（`requirements.md` の「調査結果」に記載）をもとに、要件を決めるのに必要な3点を確認します。

## 質問1: 確認範囲の記録をどこに保存しますか？

`aidlc/` の外に保存することは決まっています。チームで使うようになったときの扱いが変わります。

A. ユーザーのホーム配下（`~/.local/share/aidlc-dashboard/`）。git には入らず、自分だけの記録になる（推奨。v2 は個人利用で、承認そのものの記録は AI-DLC の audit に会話経由で残るため）
B. リポジトリ内の `.aidlc-dashboard/` に置き、git で共有する。チームで「誰がどこまで見たか」を共有できるが、コミットが増える
C. リポジトリ内の `.aidlc-dashboard/` に置くが、`.gitignore` で除外する
X. Other (please specify)

[Answer]: B（推奨理由と push の運用を説明したうえで再回答）

## 質問2: Construction フェーズの承認では、どこまでを差分に含めますか？

A. AI-DLC の記録（`aidlc/` の該当 Intent）に加えて、アプリのコード（`aidlc/` と `.claude/` 以外）の差分も表示する（推奨。コード生成の承認ではコードの変化が本体のため）
B. AI-DLC の記録だけを表示する
X. Other (please specify)

[Answer]: A

## 質問3: 差分を出すために、ダッシュボードから `git` を読み取り専用で呼び出してよいですか？

v1 では「外部コマンドを一切呼ばない」としていました。差分（git diff）を機械的に出すには `git log` と `git diff` を呼ぶ必要があります。

A. 許可する。呼べるのは `git log`／`git diff`／`git show` だけに限り、ロックファイルも作らない設定（`GIT_OPTIONAL_LOCKS=0`）で実行する。AI-DLC の CLI は引き続き呼ばない（推奨）
B. 許可しない。git を使わずに差分を出す方法を探す（JavaScript で git を読むライブラリの追加が必要になり、v1 の「依存なし」を崩す）
X. Other (please specify)

[Answer]: A
