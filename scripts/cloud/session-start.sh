#!/bin/bash
# SessionStart フック: クラウドセッションで flake の dev-tools（bun / node / uv）を
# Claude の Bash ツールの PATH 先頭に載せる。ローカルでは何もしない（direnv の `use flake` を使う）。
#
# CLAUDE_ENV_FILE に書いた内容は、以降の Bash コマンド実行前に毎回 source される。
# devShell 全体ではなく dev-tools の bin だけを載せ、ベースイメージの gcc / coreutils 等は差し替えない。
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

NIX=/nix/var/nix/profiles/default/bin/nix
if [ ! -x "$NIX" ]; then
  echo "nix not found; skipping dev-tools activation (see scripts/cloud/setup.sh)" >&2
  exit 0
fi

project_dir="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
# GC ルートを兼ねる out-link。リポジトリ外に置いて作業ツリーを汚さない。
out_link="${XDG_CACHE_HOME:-$HOME/.cache}/ai-dlc-dashboard/dev-tools"
mkdir -p "$(dirname "$out_link")"

if ! "$NIX" build "$project_dir#dev-tools" --out-link "$out_link" --no-warn-dirty; then
  echo "nix build .#dev-tools failed; falling back to pre-installed bun/node" >&2
  exit 0
fi

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$out_link/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

exit 0
