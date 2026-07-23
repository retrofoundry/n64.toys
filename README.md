# n64.toys

A live playground for **N64 display lists**. Write a display list, watch the N64 render it live in
your browser, and save & share the result as a small "toy".

**▶ [Open the playground at n64.toys](https://n64.toys)**

Each toy is a short display-list source — the same GBI macros (`gsSPVertex`, `gsDPSetCombineMode`, …)
you'd write on real hardware — exercising a slice of the N64 graphics pipeline: texture formats,
combiners, lighting, matrices, 2D framebuffer effects, and more. Edit it and the result updates live.
When you like it, publish it so others can open it, watch it render, and read how it works.

## Built on fast3d

Rendering is powered by **[fast3d](https://github.com/retrofoundry/fast3d-rs)** — a standalone,
accurate N64 HLE + wgpu renderer. It's microcode-agnostic, so the range of toys the playground can
render grows as fast3d does.

## Develop

Local dev needs [devenv](https://devenv.sh) and Docker. Sign-in is GitHub OAuth, so:

1. Copy `.env.example` to `.env`.
2. Create a GitHub OAuth app with:
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:5173/api/auth/callback/github`
3. Replace the fake GitHub client ID, client secret, and Better Auth secret in `.env`; use a fresh
   secret of at least 32 characters.
4. Start the app:

```sh
devenv shell -- dev
```

This builds the wasm renderer, starts PostgreSQL and the API, then serves the playground at
`http://localhost:5173/`. Run every project tool through `devenv shell --`:

```sh
devenv shell -- backend-up       # build and start PostgreSQL, migrations, and the API
devenv shell -- backend-down     # stop the stack without deleting PostgreSQL data
devenv shell -- db-migrate       # run pending database migrations
devenv shell -- backend-verify   # verify the expected database schema
devenv shell -- backend-logs     # follow API logs
```

PostgreSQL uses a named Docker volume, so its data persists across normal `backend-down` calls.

## Layout

- `crates/web` — the `#[wasm_bindgen]` binding around fast3d's `Renderer`.
- `web-app/` — the Svelte playground (gallery, editor, canvas).
- `server/` — the Hono + Drizzle + Better Auth API that saves and publishes toys, on PostgreSQL.

## License

[MIT](LICENSE) © Retro Foundry
