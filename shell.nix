{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  nativeBuildInputs = with pkgs.buildPackages; [
    bash-language-server
    docker-compose-language-service
    docker-language-server
    gnumake
    nodejs
    openssl
    rust-analyzer
    typescript-language-server
    vscode-langservers-extracted
  ];
}
