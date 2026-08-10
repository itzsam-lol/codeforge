"use client";

/**
 * One-time hardware/environment integrity checks, run at EnvCheck time. These
 * are signals about the machine/browser itself, not candidate behavior
 * during the test, so they run once rather than continuously like
 * useProctoring's listeners in proctoring.ts.
 *
 * Everything here is best-effort and client-side (spoofable in principle),
 * matching this repo's existing proctoring philosophy: the server owns
 * enforcement (EVENT_DEFS scoring + HARD_BLOCK_EVENT_LEVELS in
 * candidate.routes.ts), this module only produces the signal. See
 * SECURITY.md for the broader "signal, never a verdict" framing.
 */
import type { ProctoringEventType } from "@codeforge/shared";

export interface HardwareCheckResult {
  type: ProctoringEventType;
  detected: boolean;
  detail?: string;
}

const VM_RENDERER_PATTERNS = [
  /swiftshader/i,
  /llvmpipe/i,
  /vmware/i,
  /virtualbox/i,
  /microsoft basic render/i,
  /parallels/i,
];

/** WebGL renderer string: software/virtualized renderers are a common VM tell. */
export function checkGpuRenderer(): HardwareCheckResult {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return { type: "vm_suspected", detected: false };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    const detected = VM_RENDERER_PATTERNS.some((p) => p.test(renderer));
    return { type: "vm_suspected", detected, detail: renderer || undefined };
  } catch {
    return { type: "vm_suspected", detected: false };
  }
}

/**
 * navigator.webdriver plus a same-page tamper check: real automated browsers
 * expose `webdriver: true` as a native getter on the Navigator prototype;
 * stealth-evasion scripts patch it by defining an *own* property directly on
 * the `navigator` instance, which normal browsers never have regardless of
 * the value. Catches unsophisticated automation only (per SECURITY.md's
 * existing devtools-heuristic precedent, this is a deterrent signal, not a
 * guarantee).
 */
export function checkAutomationBrowser(): HardwareCheckResult {
  try {
    const nav = navigator as Navigator & { webdriver?: boolean };
    if (nav.webdriver === true) {
      return { type: "automation_browser_suspected", detected: true, detail: "navigator.webdriver" };
    }
    const hasOwnWebdriverProp = Object.prototype.hasOwnProperty.call(navigator, "webdriver");
    if (hasOwnWebdriverProp) {
      return {
        type: "automation_browser_suspected",
        detected: true,
        detail: "navigator.webdriver own-property override",
      };
    }
    const chromeUa = /chrome/i.test(navigator.userAgent) && !/edg|opr/i.test(navigator.userAgent);
    const missingChromeObject = chromeUa && !(window as unknown as { chrome?: unknown }).chrome;
    const noPlugins = navigator.plugins?.length === 0 && !/mobile|android|iphone|ipad/i.test(navigator.userAgent);
    const detected = missingChromeObject && noPlugins;
    return {
      type: "automation_browser_suspected",
      detected,
      detail: detected ? "missing window.chrome / plugin shape on a Chrome UA" : undefined,
    };
  } catch {
    return { type: "automation_browser_suspected", detected: false };
  }
}

const VIRTUAL_DEVICE_PATTERNS = [
  /obs virtual/i,
  /manycam/i,
  /snap camera/i,
  /xsplit vcam/i,
  /virtual camera/i,
  /droidcam/i,
  /iriun/i,
  /camtwist/i,
];

/** Scans already-enumerated device labels (requires a prior getUserMedia
 * grant — labels are blank otherwise) for known virtual-camera/mic software. */
export function checkVirtualDevices(devices: MediaDeviceInfo[]): HardwareCheckResult {
  const match = devices.find(
    (d) =>
      (d.kind === "videoinput" || d.kind === "audioinput") &&
      VIRTUAL_DEVICE_PATTERNS.some((p) => p.test(d.label))
  );
  return { type: "virtual_camera_suspected", detected: Boolean(match), detail: match?.label };
}

/**
 * Small fixed-cost CPU workload, timed against a conservative threshold.
 * Advisory only (see the token EVENT_DEFS penalty for this type): a
 * legitimately low-end but honest machine must never be meaningfully
 * penalized for failing this, only warned that the test may run slowly.
 */
export function checkHardwareFloor(): HardwareCheckResult {
  try {
    const start = performance.now();
    let acc = 0;
    for (let i = 0; i < 4_000_000; i++) acc += Math.sqrt(i) % 7;
    void acc;
    const elapsedMs = performance.now() - start;
    const cores = navigator.hardwareConcurrency ?? 4;
    // Require both a slow result AND low core count so a fast single
    // workload on a momentarily-busy-but-capable machine doesn't trip it.
    const detected = elapsedMs > 400 && cores <= 2;
    return { type: "hardware_below_floor", detected, detail: `${elapsedMs.toFixed(0)}ms on ${cores} cores` };
  } catch {
    return { type: "hardware_below_floor", detected: false };
  }
}

const VIRTUAL_ADAPTER_PATTERNS = [/vmware/i, /virtualbox/i, /vpn/i, /tap-/i, /tun\d/i, /hyper-v/i];

/** WebRTC local ICE candidate enumeration: unusual virtual network adapter
 * names show up here on some VM/remote-desktop setups. Best-effort and
 * time-boxed so it never blocks the rest of the environment check. */
export function checkVirtualNetworkAdapter(): Promise<HardwareCheckResult> {
  if (typeof RTCPeerConnection === "undefined") {
    return Promise.resolve({ type: "virtual_network_adapter", detected: false });
  }
  return new Promise((resolve) => {
    let settled = false;
    const pc = new RTCPeerConnection({ iceServers: [] });
    const finish = (detected: boolean, detail?: string) => {
      if (settled) return;
      settled = true;
      pc.close();
      resolve({ type: "virtual_network_adapter", detected, detail });
    };
    pc.onicecandidate = (e) => {
      const candidate = e.candidate?.candidate ?? "";
      if (candidate && VIRTUAL_ADAPTER_PATTERNS.some((p) => p.test(candidate))) {
        finish(true, candidate);
      }
    };
    pc.createDataChannel("cf-probe");
    pc
      .createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => finish(false));
    setTimeout(() => finish(false), 1500);
  });
}

/** Runs every check. `devices` should come from the caller's already-granted
 * getUserMedia stream (see EnvCheck.tsx) so device labels are populated. */
export async function runHardwareChecks(devices: MediaDeviceInfo[]): Promise<HardwareCheckResult[]> {
  const [network] = await Promise.all([checkVirtualNetworkAdapter()]);
  return [
    checkGpuRenderer(),
    checkAutomationBrowser(),
    checkVirtualDevices(devices),
    checkHardwareFloor(),
    network,
  ];
}
