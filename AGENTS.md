# n64-toys

A live playground for **N64 display lists**: author gbi-macro / F3DEX2 command streams and render
them with an accurate **wgpu/WebGPU** engine. Authored source stays portable to real N64 projects.

## Principles

- **Aim for simplicity.** Prefer the smallest design that works. Avoid speculative abstraction and
  premature generality — build for the current milestone, not an imagined one. Keep components
  small, focused, and independently testable; when a file or module grows to do too many things,
  that's a signal to split it. Add complexity only when a concrete need forces it.
- **The N64 engine is external — this repo is the playground.** All display-list assembly, microcode
  HLE interpretation, and wgpu rendering live in [`fast3d-rs`](https://github.com/retrofoundry/fast3d-rs)
  (`crates/web/Cargo.toml` depends on it via git). This repo owns only the authoring UI (`web-app`),
  toy persistence (`server`), and a thin wasm-bindgen bridge (`crates/web`) over `fast3d::asm` + the
  renderer. Changes to assembling, HLE, or rendering belong upstream in fast3d-rs, not here.

## Tooling

- **Use devenv for all tools.** Every toolchain and binary this project needs (Rust + the wasm
  target, Node/Svelte, wasm-bindgen, formatters, etc.) belongs in `devenv.nix` and is accessed
  through the devenv shell. Do **not** install tools globally (`brew install`, global `cargo install`,
  system Node) or assume a system-wide binary exists — this repo has a `devenv.nix`, so run everything
  through it:

  ```bash
  devenv shell -- cli args
  ```

- **Missing tool, no devenv.nix?** Spin up an ad-hoc environment rather than installing globally:

  ```bash
  devenv -O languages.rust.enable:bool true -O packages:pkgs "mypackage mypackage2" shell -- cli args
  ```

  Once the setup grows complex, add it to `devenv.nix` and run within it (`devenv shell -- cli args`).
  See <https://devenv.sh/ad-hoc-developer-environments/>.

## Definition of done — required checks

Before committing, and before considering any task complete, **all of these must pass** (run via
devenv):

```bash
devenv shell -- cargo test                                      # all tests green
devenv shell -- cargo clippy --all-targets                      # ZERO warnings
devenv shell -- cargo fmt --check                               # formatted
devenv shell -- cargo build -p web --target wasm32-unknown-unknown   # wasm crate builds
devenv shell -- pnpm check                                      # TypeScript/Svelte checks
devenv shell -- pnpm test                                       # frontend and backend tests
devenv shell -- build-wasm                                      # release wasm + bindings
devenv shell -- pnpm build                                      # production packages build
devenv shell -- docker compose --env-file .env.example config --quiet
```

- `cargo clippy --all-targets` must be **warning-free** (treat clippy warnings as failures). Prefer
  fixing the lint over `#[allow(...)]`; only suppress with a one-line justification when the lint is
  genuinely wrong for the context.
- `cargo fmt` is the formatting authority — run it before committing; `cargo fmt --check` must pass.
- The `web` crate's JS-facing surface (`Renderer`, `render`, the asm/present wiring) is per-item
  `#[cfg(target_arch = "wasm32")]`-gated, so native `cargo test` and rust-analyzer only cover the pure
  helpers — always verify the render path with the wasm build above.
- Compose runtime verification is a separate required smoke test because it needs a running Docker
  daemon: build and start `db`, `migrate`, and `api`; verify the schema, health endpoint, signed-out
  session, and hostile-origin rejection; then stop the stack without deleting its named volume.

## Layout

- `crates/web/` — the sole Rust crate: a wasm-bindgen bridge over `fast3d-rs` (assemble gbi macros →
  HLE → wgpu render).
- `web-app/` — Svelte 5 SPA (the authoring UI).
- `server/` — Hono + Drizzle + Better Auth API for saving/publishing toys, on Postgres.
- `examples/toys/` — reference `.n64` gbi-macro sources (gitignored; local only).
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design spec + implementation plan
  (gitignored; local only).
- `reference/` — read-only reference material (gitignored).

## Run it

```bash
devenv shell -- dev          # builds the wasm renderer, serves the SPA at http://localhost:5173/
devenv shell -- backend-up   # Postgres + API (migrate + serve) via docker compose
```
