{
  description = "ai-dlc-dashboard development environment (bun + Node.js)";

  inputs = {
    # `github:` 参照は GitHub API を叩くため、Claude Code クラウド環境のプロキシで拒否される。
    # 許可ドメイン (*.nixos.org) の channel tarball を使うと、ローカル・クラウド両方で取得できる。
    nixpkgs.url = "https://channels.nixos.org/nixos-unstable/nixexprs.tar.xz";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems =
        f:
        nixpkgs.lib.genAttrs systems (
          system:
          f {
            inherit system;
            pkgs = nixpkgs.legacyPackages.${system};
          }
        );

      # 開発に必要なツール一式。devShell と profile インストール用パッケージで共有する。
      toolsFor =
        pkgs: with pkgs; [
          bun
          nodejs_22
          # .mcp.json の AWS 系 MCP サーバーは uvx で起動する
          uv
        ];
    in
    {
      packages = forAllSystems (
        { pkgs, ... }:
        {
          # `nix profile install .#dev-tools` で PATH に常駐させる用途（クラウド環境の hooks 向け）
          dev-tools = pkgs.buildEnv {
            name = "ai-dlc-dashboard-dev-tools";
            paths = toolsFor pkgs;
          };
          default = self.packages.${pkgs.stdenv.hostPlatform.system}.dev-tools;
        }
      );

      devShells = forAllSystems (
        { pkgs, ... }:
        {
          default = pkgs.mkShellNoCC {
            packages = toolsFor pkgs;
            shellHook = ''
              # stdout を汚すと `nix develop --command` の出力を取り込む処理が壊れるため stderr に出す
              echo "ai-dlc-dashboard devShell: bun $(bun --version), node $(node --version)" >&2
            '';
          };
        }
      );

      formatter = forAllSystems ({ pkgs, ... }: pkgs.nixfmt);
    };
}
