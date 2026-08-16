import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tauri v2 dev-server conventions: fixed port so src-tauri's tauri.conf.json
// devUrl can point at it deterministically, and don't let Vite clear the
// terminal so `tauri dev`'s own Rust build output stays visible alongside it.
export default defineConfig({
  // @tailwindcss/vite is a standalone Vite plugin (not a PostCSS plugin) —
  // it doesn't go through the css.postcss path below, so it's unaffected by
  // that override and needs no separate config file. Same @theme block as
  // apps/web/src/app/globals.css, deliberately kept in sync — see globals.css.
  plugins: [react(), tailwindcss()],
  // tsconfig.json's "paths" only governs TypeScript's own checker — Vite's
  // bundler needs this mirrored explicitly, or "@/..." imports resolve fine
  // under `tsc --noEmit` but 500 at dev-server runtime.
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // Explicit (empty) PostCSS config: without this, Vite searches upward
  // from this directory for a postcss.config.* and — on this machine —
  // finds an unrelated one in the user's home directory that requires
  // `tailwindcss`, which this project doesn't use. Pinning it here stops
  // that upward search entirely.
  css: { postcss: {} },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Rust rebuilds are cargo's job, not Vite's — watching src-tauri here
      // would just trigger redundant frontend HMR on every Rust file save.
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
