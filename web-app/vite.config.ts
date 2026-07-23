import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [tailwindcss(), svelte(), wasm(), topLevelAwait()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3001",
    },
  },
  build: { target: "esnext" },
});
