# CodeForge Sentinel

System-level proctoring companion app (Tauri v2 + Rust). See the implementation plan for the full phased scope; this README only covers what's actually built and how to run it.

## Status: Phases 1-6 done (scaffold, process monitor, VM detection, kiosk mode, capture prevention, clipboard lockdown)

What exists right now:
- A working Tauri v2 project (`src-tauri/`) + Vite/React/TS frontend (`src/`), wired into the npm workspace as `@codeforge/sentinel`. Compiled, linked, and launched successfully — verified live via `cargo check`, `cargo clippy` (zero warnings), and repeated `npm run dev:sentinel` runs (a real "CodeForge Sentinel" window opens and stays responsive), including actual window screenshots to verify the UI, not just that it compiles.
- `get_system_info`: OS name/version/hostname, rendered on load (Phase 1).
- A background watchdog thread (`src-tauri/src/services/watchdog.rs`) polling every 3s for blacklisted processes across the spec's categories (remote desktop, VM tooling, screen sharing, AI assistants, screenshot tools, automation, communication apps). Critical categories are blocked on sight; everything else gets a 30s soft-block grace period before escalating. Also flags orphaned processes. Violations stream live to the frontend (`src/hooks/useProcessMonitor.ts`) and render in `SystemStatus`/`ViolationAlert` (Phase 2).
- `set_auto_terminate_on_hard_violation` exists but defaults **off** — auto-killing a candidate's process is an explicit opt-in, not a silent default.
- `detect_virtual_machine` (`src-tauri/src/commands/vm_detector.rs`, Phase 3): combines CPUID hypervisor signals, network MAC vendor prefixes, Windows registry BIOS/service checks, and filesystem artifacts into a 0-100 confidence score, deliberately weighted so Windows 11's Virtualization-Based Security and Hyper-V-backed WSL2/Docker Desktop don't false-positive a real physical dev machine — verified against this exact scenario live. Rendered in the `VmStatus` card.
- A real design system (`src/styles/globals.css`) — 16px base type, dark palette, cards/pills/badges, hand-written inline SVG icons (no icon-library dependency).
- Root scripts: `npm run dev:sentinel` and `npm run typecheck` include this workspace.

Phases 4-6 added: `kiosk.rs` (fullscreen/always-on-top toggle + display count — live-verified; a real WH_KEYBOARD_LL global hotkey-block hook exists but is deliberately NOT invoked live or exposed in the UI yet — see its doc comment), `screen_guard.rs` (SetWindowDisplayAffinity capture protection — live-verified), `clipboard.rs` (polling-based clipboard guard + one-shot clear — compiled/clippy-clean, not live-tested against a real clipboard). Task Manager disabling (part of the original Phase 4 spec) was deliberately not built — a persistent registry security-policy change needs its own explicit go-ahead.

What's **not** built yet: network watching, webcam pipeline, integrity fingerprinting, or the CodeForge API integration (heartbeat endpoint, `requireSentinel` test setting, dashboard panel). Those are Phases 7–10, not started. Also not implemented: the spec's real-time process-spawn detection (Phase 2) and VM-detection timing-attack signal (Phase 3, explicitly "supplementary, not primary" — skipped as too noisy for the value).

**Deliberate deviations from the spec, worth knowing about:**
1. `tauri.conf.json`'s window is a normal decorated, resizable, non-always-on-top window, not the fullscreen/borderless/always-on-top kiosk window the spec describes. There's no working exit/submit flow yet (that's Phase 4 kiosk-mode work) — shipping an inescapable fullscreen window before that exists would strand anyone running `npm run dev:sentinel`. Flip those four flags in `src-tauri/tauri.conf.json`'s `app.windows[0]` when kiosk mode is actually being built.
2. `src-tauri/icons/*` are generated placeholders (solid indigo squares), not real branding. Replace with `tauri icon <source.png>` once there's real artwork.

## Setup

Requires:
1. **Rust** via [rustup](https://rustup.rs) (Windows: `winget install Rustlang.Rustup`).
2. **MSVC Build Tools** (Windows only) — the "Desktop development with C++" workload. Silent install: `winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`. Rust alone can't link anything on Windows without this.
3. **WebView2**: pre-installed on Windows 11 / most Windows 10 systems.

```sh
npm install          # from the repo root, if not already done
npm run dev:sentinel  # from the repo root — builds the Rust backend + starts Vite, opens the app window
```

**If you're on Git Bash and hit a linker error like `link: extra operand '...'`**: that's Git's own `/usr/bin/link.exe` (a hardlink utility) shadowing the real MSVC linker on PATH. Run `cargo`/`npm run dev:sentinel` from PowerShell or cmd instead, not Git Bash.

The first build compiles ~378 crates from scratch and is slow; subsequent runs are incremental (~1s once nothing changed). If a build fails with a `The process cannot access the file because it is being used by another process` error on an intermediate `.o` file, that's a transient Windows file-lock (commonly antivirus real-time scanning) — just retry.
