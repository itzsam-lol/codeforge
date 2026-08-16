# CodeForge Sentinel

System-level proctoring companion app (Tauri v2 + Rust). See the implementation plan for the full phased scope; this README only covers what's actually built and how to run it.

## Status: Phases 1-7, 9, and 10 done (webcam/audio — Phase 8 — is handled in-browser by apps/web, not by this native app; see below). Phase 11 partially not possible (see below).

What exists right now:
- A working Tauri v2 project (`src-tauri/`) + Vite/React/TS frontend (`src/`), wired into the npm workspace as `@codeforge/sentinel`. Compiled, linked, and launched successfully — verified live via `cargo check`, `cargo clippy` (zero warnings), and repeated `npm run dev:sentinel` runs (a real "CodeForge Sentinel" window opens and stays responsive), including actual window screenshots to verify the UI, not just that it compiles.
- `get_system_info`: OS name/version/hostname, rendered on load (Phase 1).
- A background watchdog thread (`src-tauri/src/services/watchdog.rs`) polling every 3s for blacklisted processes across the spec's categories (remote desktop, VM tooling, screen sharing, AI assistants, screenshot tools, automation, communication apps). Critical categories are blocked on sight; everything else gets a 30s soft-block grace period before escalating. Also flags orphaned processes. Violations stream live to the frontend (`src/hooks/useProcessMonitor.ts`) and render in `SystemStatus`/`ViolationAlert` (Phase 2).
- `set_auto_terminate_on_hard_violation` exists but defaults **off** — auto-killing a candidate's process is an explicit opt-in, not a silent default.
- `detect_virtual_machine` (`src-tauri/src/commands/vm_detector.rs`, Phase 3): combines CPUID hypervisor signals, network MAC vendor prefixes, Windows registry BIOS/service checks, and filesystem artifacts into a 0-100 confidence score, deliberately weighted so Windows 11's Virtualization-Based Security and Hyper-V-backed WSL2/Docker Desktop don't false-positive a real physical dev machine — verified against this exact scenario live. Rendered in the `VmStatus` card.
- A real design system (`src/styles/globals.css`) — 16px base type, dark palette, cards/pills/badges, hand-written inline SVG icons (no icon-library dependency).
- Root scripts: `npm run dev:sentinel` and `npm run typecheck` include this workspace.

Phases 4-6 added: `kiosk.rs` (fullscreen/always-on-top toggle + display count — live-verified; a real WH_KEYBOARD_LL global hotkey-block hook exists but is deliberately NOT invoked live or exposed in the UI yet — see its doc comment), `screen_guard.rs` (SetWindowDisplayAffinity capture protection — live-verified), `clipboard.rs` (polling-based clipboard guard + one-shot clear — compiled/clippy-clean, not live-tested against a real clipboard). Task Manager disabling (part of the original Phase 4 spec) was deliberately not built — a persistent registry security-policy change needs its own explicit go-ahead.

Phase 7 (`network_watcher.rs`): `get_active_connections` enumerates established TCP connections + owning process via `GetExtendedTcpTable`. No hardcoded allowlist/blocklist of IPs — that's fragile (shared CDN IPs, rotation). `flag_unexpected_connections` takes an allowlist as an argument instead.

Phase 9 (`integrity.rs`): `get_system_fingerprint` hashes CPU/RAM/display/MAC/OS/hostname/disk-serial into one SHA-256. GPU model omitted (needs DXGI/WMI, sysinfo doesn't expose it). Drift-detection polling and cross-session server matching are Phase 10/dashboard work, not built.

Phase 10, now fully done: `POST /api/candidate/sentinel-heartbeat` (apps/api) + a 30s sweep flagging stale heartbeats (`sentinel_heartbeat_lost`) + this app's `services/heartbeat.rs` client, all live-verified end-to-end against a real running instance (heartbeat → DB → violation events → integrity recalculation → sweep → auto-flag, not just typechecked). On top of that:
- `requireSentinel` test setting (`packages/shared`'s `testSettingsSchema`) gates `/api/candidate/start` and is surfaced to the candidate as `proctoring.sentinelRequired` on `GET /api/candidate/context`, alongside a `session.sentinelConnected` flag (a heartbeat within the last `HEARTBEAT_TIMEOUT_MS`, same 60s window the stale-sweep uses).
- `apps/web`'s `/t/[token]` page gates `StartCard` behind a new `SentinelGate` component when `sentinelRequired` is true and not yet connected — it opens a `codeforge-sentinel://start?apiUrl=...&token=...` link and polls context every 3s until connected. No hosted installer download exists (see Phase 11 below), so the gate assumes the org already got Sentinel onto the candidate's machine.
- `codeforge-sentinel://` deep-link protocol registration (`tauri-plugin-deep-link`, configured in `tauri.conf.json`'s `plugins.deep-link.desktop.schemes`), paired with `tauri-plugin-single-instance` (the `deep-link` feature) so a candidate clicking the link while Sentinel is already open reuses the window instead of spawning a duplicate. `src-tauri/src/services/session_link.rs` parses the URL, starts the heartbeat loop, and emits `sentinel://session` for the new `SessionConnect` card (`src/components/SessionConnect.tsx`) to show connected/waiting/error state — with a manual API-URL/token fallback for when the link can't reach Sentinel. Self-registers the protocol on every dev launch (per-user registry write, no admin rights) so this works under `npm run dev:sentinel` too, not just an installed build.
- Live-verified end-to-end against the real API + Postgres: a real invitation token, a real `codeforge-sentinel://` link opened via `Start-Process`, confirmed single-instance forwarding (no duplicate window), and `GET /api/candidate/context` flipping `sentinelConnected` to `true` off a real heartbeat POST — not just typechecked.

**Phase 8 (webcam/audio): not part of this app.** It's built in `apps/web` instead — `useWebcamCapture`/`captureSnapshot` in `apps/web/src/lib/proctoring.ts`, wired into `EnvCheck` (identity photo) and `TestRunner` (random-interval snapshots) — since the candidate is already in the browser for the timed test itself; a second native capture path would be redundant. Sentinel's own scope stays system-level monitoring (processes, network, VM/integrity, kiosk, clipboard).

**Phase 11 (security hardening) not started, and can't fully be**: code signing (EV certificate, Apple Developer ID + notarization) and a real auto-update server both require you to own actual paid certificates/accounts — not something buildable by an agent. The self-hash anti-tamper check is the one piece of Phase 11 that's genuinely buildable without external resources; not attempted yet.

Also not implemented: the spec's real-time process-spawn detection (Phase 2, Windows WMI/macOS Endpoint Security/Linux netlink) and VM-detection timing-attack signal (Phase 3, explicitly "supplementary, not primary" in the spec).

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
