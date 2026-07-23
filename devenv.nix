{ pkgs, lib, ... }:
{
  languages.rust = {
    enable = true;
    toolchainFile = ./rust-toolchain.toml;
  };

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    pnpm.enable = true;
  };

  packages = [
    pkgs.wasm-bindgen-cli_0_2_108
    pkgs.docker-client
    pkgs.docker-compose
    pkgs.ripgrep
  ];

  scripts.build-wasm.exec = ''
    task_cargo_home="$HOME/.cargo"
    if test -n "''${CARGO_HOME:-}"; then
      task_cargo_home="$CARGO_HOME"
    fi
    task_remap_flags="--remap-path-prefix=$task_cargo_home=/cargo --remap-path-prefix=$PWD=/workspace"
    RUSTFLAGS="''${RUSTFLAGS:+$RUSTFLAGS }$task_remap_flags" \
      cargo build -p web --target wasm32-unknown-unknown --release
    wasm-bindgen target/wasm32-unknown-unknown/release/web.wasm \
      --target web --out-dir web-app/src/wasm --out-name n64_toys
    if rg --text --quiet '/Users/|/home/' web-app/src/wasm/n64_toys_bg.wasm; then
      echo "generated wasm contains an absolute developer path" >&2
      exit 1
    fi
  '';

  scripts.backend-up.exec = "docker compose --env-file .env up --build -d";
  scripts.backend-down.exec = "docker compose --env-file .env down";
  scripts.backend-logs.exec = "docker compose --env-file .env logs -f api";
  scripts.db-generate.exec = "pnpm --filter @n64-toys/server db:generate";
  scripts.db-migrate.exec =
    "docker compose --env-file .env run --rm migrate";
  scripts.backend-verify.exec =
    "docker compose --env-file .env run --rm api node dist/db/verify.js";

  scripts.dev.exec = ''
    test -f .env || { echo ".env is required; copy .env.example and replace the fake values" >&2; exit 1; }
    pnpm install
    backend-up
    build-wasm
    pnpm --filter @n64-toys/web dev
  '';
}
