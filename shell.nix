{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  nativeBuildInputs = with pkgs.buildPackages; [
    bash-language-server
    cargo
    docker-compose-language-service
    docker-language-server
    gnumake
    nodejs
    openssl
    pkg-config
    rustc
    rust-analyzer
    typescript-language-server
    vscode-langservers-extracted
  ];
}
