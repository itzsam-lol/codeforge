import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri v2 dev-server conventions: fixed port so src-tauri's tauri.conf.json
// devUrl can point at it deterministically, and don't let Vite clear the
// terminal so `tauri dev`'s own Rust build output stays visible alongside it.
export default defineConfig({
  plugins: [react()],
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
