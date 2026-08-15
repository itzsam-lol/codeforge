# CodeForge Sentinel

System-level proctoring companion app (Tauri v2 + Rust). See the implementation plan for the full phased scope; this README only covers what's actually built and how to run it.

## Status: Phase 1 (scaffold) only

What exists right now:
- A working Tauri v2 project structure (`src-tauri/`) + Vite/React/TS frontend (`src/`), wired into the npm workspace as `@codeforge/sentinel`.
- One real IPC round-trip: `get_system_info` (Rust, `src-tauri/src/commands/system_info.rs`) returns OS name/version/hostname, rendered by `src/App.tsx`.
- Root scripts: `npm run dev:sentinel` (from the repo root) and `npm run typecheck` now include this workspace.

What's **not** built yet: process monitoring, VM detection, kiosk-mode lockdown, screen-capture prevention, clipboard lockdown, network watching, webcam pipeline, integrity fingerprinting, or the CodeForge API integration (heartbeat endpoint, `requireSentinel` test setting, dashboard panel). Those are Phases 2–10 of the implementation plan, not started.

**Two deliberate deviations from the original phase-1 spec, both worth knowing about:**
1. `tauri.conf.json`'s window is a normal decorated, resizable, non-always-on-top window, not the fullscreen/borderless/always-on-top kiosk window the spec describes for Phase 1. There's no working exit/submit flow yet (that's Phase 4 kiosk-mode work) — shipping an inescapable fullscreen window before that exists would strand anyone running `npm run dev:sentinel` for the first time. Flip those four flags in `src-tauri/tauri.conf.json`'s `app.windows[0]` when kiosk mode is actually being built.
2. `src-tauri/icons/*` are generated placeholders (solid indigo squares — see the equivalent generation logic, not checked in as a script), not real branding. Replace them with `tauri icon <source.png>` once there's real artwork.

## Setup

This machine had no Rust toolchain when this was scaffolded (`cargo`/`rustc` not found). You need:

1. **Rust**: install via [rustup](https://rustup.rs) (Windows: `winget install Rustlang.Rustup`, then restart your shell so `cargo`/`rustc` are on PATH).
2. **MSVC Build Tools** (Windows only): the "Desktop development with C++" workload from the [Visual Studio Build Tools installer](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — Tauri's Rust backend needs the MSVC linker.
3. **WebView2**: pre-installed on Windows 11 / most Windows 10 systems; if missing, Tauri's own docs link the redistributable.

Once `cargo --version` works:

```sh
npm install          # from the repo root, if not already done
npm run dev:sentinel  # from the repo root — builds the Rust backend + starts Vite, opens the app window
```

The first `cargo build` will be slow (compiling every dependency from scratch); subsequent runs are incremental.

None of the Rust code in `src-tauri/` has been compiled or run yet — write access to files, but no toolchain to verify against, so treat it as unverified until your first successful `npm run dev:sentinel`.
