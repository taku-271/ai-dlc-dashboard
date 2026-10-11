# 開発環境（Nix flake）

bun と Node.js（＋ `.mcp.json` の AWS MCP サーバー用の `uv`）を Nix flake で固定しています。

| ツール | パッケージ | 備考 |
| --- | --- | --- |
| bun | `pkgs.bun` | AI-DLC のツール・フックの実行に使用 |
| Node.js | `pkgs.nodejs_22` | LTS |
| uv / uvx | `pkgs.uv` | AWS 系 MCP サーバーの起動に使用 |

バージョンは `flake.lock` で固定しています。更新するときは `nix flake update` を実行してコミットしてください。

> nixpkgs は `github:` ではなく `https://channels.nixos.org/...` の tarball を参照しています。
> `github:` 参照は GitHub API を呼ぶため、Claude Code のクラウド環境ではプロキシに拒否されるためです。

## ローカル

```bash
# Nix をインストール（未導入の場合）
curl -sSfL https://artifacts.nixos.org/nix-installer | sh -s -- install

# devShell に入る
nix develop

# direnv を使う場合（.envrc に `use flake` を同梱）
direnv allow
```

## Claude Code クラウド環境

クラウド環境では次の 2 段構えで Nix の bun / Node.js を使えるようにしています。

| 段階 | ファイル | タイミング | 役割 |
| --- | --- | --- | --- |
| 1. 初期セットアップ | `scripts/cloud/setup.sh` | Claude Code 起動前（環境キャッシュ作成時のみ） | Nix のインストール、flakes の有効化、`dev-tools` の事前ビルド |
| 2. SessionStart フック | `scripts/cloud/session-start.sh` | 毎セッション開始・再開時 | `nix build .#dev-tools` の結果を `CLAUDE_ENV_FILE` 経由で Bash ツールの `PATH` 先頭に追加 |

### 設定手順

1. claude.ai/code でクラウド環境の設定（セッションのタイトルバーの環境メニュー → Edit）を開く
2. **Setup script** 欄に `scripts/cloud/setup.sh` の内容をそのまま貼り付けて保存
3. ネットワークアクセスは既定の **Trusted** のままで OK（`*.nixos.org` と GitHub のリリースアセットが許可済み）

Setup script の実行後のファイルシステムはスナップショットとしてキャッシュされるため、2 回目以降のセッションでは Nix のインストールとパッケージ取得は省略されます（約 7 日でキャッシュは再作成）。

### 補足

- SessionStart フックは `CLAUDE_CODE_REMOTE=true` のときだけ動作し、ローカルでは何もしません。
- devShell 全体ではなく bun / node / uv だけを `PATH` に載せるので、ベースイメージの gcc や coreutils は置き換わりません。
- Nix が無い・ビルドに失敗した場合はフックが警告を出して終了し、ベースイメージに入っている bun / Node.js 22 がそのまま使われます。
- AI-DLC の各フック（`bun .claude/hooks/...`）は Claude Code 本体のプロセス環境で起動するため、`CLAUDE_ENV_FILE` の影響を受けずベースイメージの bun で動きます。
