#!/bin/bash
# Claude Code クラウド環境の「Setup script」欄に貼り付けて使う初期セットアップスクリプト。
#
# - Claude Code 起動前に root で実行され、完了後のファイルシステムはスナップショットとして
#   キャッシュされる（約 5 分以内に終わる必要がある）。
# - 非ゼロ終了するとセッションが起動しないため、致命的でない処理は `|| true` で握りつぶす。
# - 何度実行しても同じ結果になる（冪等）ように書いている。
set -uo pipefail

log() { echo "[cloud-setup] $*"; }

NIX_BIN=/nix/var/nix/profiles/default/bin

# 1. Nix のインストール（未導入時のみ）
#    コンテナには systemd が無いので --init none（デーモン無しの単一ユーザー構成）で入れる。
#    artifacts.nixos.org はクラウド環境の既定許可ドメイン (*.nixos.org) に含まれる。
if [ ! -x "$NIX_BIN/nix" ]; then
  log "installing Nix"
  curl -sSfL https://artifacts.nixos.org/nix-installer \
    | sh -s -- install linux --init none --no-confirm \
    || { log "Nix install failed; continuing without Nix"; exit 0; }
else
  log "Nix already installed: $("$NIX_BIN/nix" --version)"
fi
export PATH="$NIX_BIN:$PATH"

# 2. flakes を有効化（nix-installer は既定で有効にするが、念のため冪等に追記）
if ! grep -qs "flakes" /etc/nix/nix.conf; then
  echo "extra-experimental-features = nix-command flakes" >> /etc/nix/nix.conf
fi

# 3. dev-tools / devShell の事前ビルド（ストアをキャッシュに載せ、各セッションの起動を速くする）
#    Setup script は環境単位でリポジトリの場所を受け取らないので、クローン先を探索する。
for flake in /home/user/*/flake.nix; do
  [ -f "$flake" ] || continue
  dir=$(dirname "$flake")
  log "prefetching dev-tools for $dir"
  timeout 240 nix build "$dir#dev-tools" --no-link --no-warn-dirty \
    || log "dev-tools prefetch failed for $dir (will retry at session start)"
done

exit 0
