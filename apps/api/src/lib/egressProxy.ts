/**
 * Egress-restricted network for the repo-grading pool (SECURITY.md "Isolation
 * of untrusted code"). The grading container needs real internet access
 * (git clone + npm install), unlike the fully `--internal`/`--network none`
 * Phase 3 graders, but it must not get a general internet route: it's
 * attached ONLY to a fresh `--internal` Docker network, and its one way out
 * is an allowlist-only CONNECT proxy (`docker/egress-proxy`) that's dual-
 * homed onto that internal network plus the normal (internet-routed) bridge.
 */
import path from "node:path";
import { execDocker, randomName, removeContainer, removeNetwork } from "./dockerUtil";
import { logger } from "./logger";
import { config } from "../config";

const PROXY_IMAGE = "codeforge-egress-proxy:latest";
let imageBuilt = false;

async function ensureProxyImage(): Promise<void> {
  if (imageBuilt) return;
  const check = await execDocker(["image", "inspect", PROXY_IMAGE], { timeoutMs: 10_000 });
  if (check.code === 0) {
    imageBuilt = true;
    return;
  }
  logger.info("building codeforge-egress-proxy image (first use)");
  const dir = path.join(__dirname, "..", "..", "docker", "egress-proxy");
  const build = await execDocker(["build", "-t", PROXY_IMAGE, dir], { timeoutMs: 120_000 });
  if (build.code !== 0) throw new Error(`failed to build egress proxy image: ${build.stderr}`);
  imageBuilt = true;
}

export interface EgressSession {
  /** --network value for the grading container. */
  network: string;
  /** Env args (repeated -e KEY=VALUE) to make git/npm route through the proxy. */
  proxyEnvArgs: string[];
  cleanup: () => Promise<void>;
}

/** Spins up a fresh internal network + allowlist proxy; caller must cleanup(). */
export async function startEgressSession(): Promise<EgressSession> {
  await ensureProxyImage();
  const network = randomName("cf-repo-net");
  const proxyName = randomName("cf-repo-proxy");

  await execDocker(["network", "create", "--internal", network], { timeoutMs: 20_000 });
  const start = await execDocker(
    [
      "run", "-d", "--name", proxyName,
      "-e", `ALLOWED_HOSTS=${config.gradingEgressAllowlist}`,
      "--memory", "128m", "--cpus", "0.5", "--pids-limit", "64",
      PROXY_IMAGE,
    ],
    { timeoutMs: 20_000 }
  );
  if (start.code !== 0) {
    await removeNetwork(network);
    throw new Error(`failed to start egress proxy: ${start.stderr}`);
  }
  // Dual-home: the proxy keeps its default (internet-routed) network and also
  // joins the internal grading network, so it's the only bridge between them.
  await execDocker(["network", "connect", network, proxyName], { timeoutMs: 20_000 });

  const proxyUrl = `http://${proxyName}:8080`;
  const proxyEnvArgs = ["-e", `HTTP_PROXY=${proxyUrl}`, "-e", `HTTPS_PROXY=${proxyUrl}`, "-e", `http_proxy=${proxyUrl}`, "-e", `https_proxy=${proxyUrl}`];

  return {
    network,
    proxyEnvArgs,
    cleanup: async () => {
      await removeContainer(proxyName);
      await removeNetwork(network);
    },
  };
}
