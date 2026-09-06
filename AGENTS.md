# n64-toys

A live playground for **N64 display lists**: author gbi-macro / F3DEX2 command streams and render
them with an accurate **wgpu/WebGPU** engine. Authored source stays portable to real N64 projects.

## Principles

- **Aim for simplicity.** Prefer the smallest design that works. Avoid speculative abstraction and
  premature generality — build for the current milestone, not an imagined one. Keep components
  small, focused, and independently testable; when a file or module grows to do too many things,
  that's a signal to split it. Add complexity only when a concrete need forces it.
- **This repo owns the language.** Display-list assembly lives in `crates/asm`. Microcode HLE
  interpretation and wgpu rendering stay in [`fast3d-rs`](https://github.com/retrofoundry/fast3d-rs).
  This repo also owns the authoring UI (`web-app`), toy persistence (`server`), and the thin
  wasm-bindgen bridge (`crates/web`) between the assembler and renderer.

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
devenv shell -- cargo test -p n64-toys-asm                       # compiler tests
devenv shell -- cargo test -p asm-compat                         # compatibility corpus
devenv shell -- cargo clippy --all-targets                      # ZERO warnings
devenv shell -- cargo fmt --check                               # formatted
devenv shell -- cargo build -p web --target wasm32-unknown-unknown   # wasm crate builds
devenv shell -- pnpm check                                      # TypeScript/Svelte checks
devenv shell -- pnpm test                                       # frontend and backend tests
devenv shell -- build-wasm                                      # release wasm + bindings
devenv shell -- pnpm build                                      # production packages build
devenv shell -- docker compose --env-file .env.example config --quiet
devenv shell -- pnpm smoke                                      # compose runtime smoke (needs Docker)
```

- `cargo clippy --all-targets` must be **warning-free** (treat clippy warnings as failures). Prefer
  fixing the lint over `#[allow(...)]`; only suppress with a one-line justification when the lint is
  genuinely wrong for the context.
- `cargo fmt` is the formatting authority — run it before committing; `cargo fmt --check` must pass.
- The `web` crate's JS-facing surface (`Renderer`, `render`, the asm/present wiring) is per-item
  `#[cfg(target_arch = "wasm32")]`-gated, so native `cargo test` and rust-analyzer only cover the pure
  helpers — always verify the render path with the wasm build above.
- Compose runtime verification is a separate required smoke test because it needs a running Docker
  daemon: build and start `n64-db`, `migrate`, and `api`; verify the schema, health endpoint, signed-out
  session, and hostile-origin rejection; then stop the stack without deleting its named volume.

## Layout

- `crates/asm/` — the GBI text assembler and language tests (`n64-toys-asm`).
- `tools/asm-compat/` — compatibility corpus tests and the expected-output candidate writer.
- `crates/web/` — a wasm-bindgen bridge over `n64-toys-asm` and `fast3d-rs` (assemble gbi macros →
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
