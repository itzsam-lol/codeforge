/**
 * Frontend UI challenge grading (spec 5.1): headless Chromium renders the
 * candidate's HTML/CSS/JS at each breakpoint and compares it pixel-by-pixel
 * (pixelmatch) against pre-rendered reference screenshots, then runs DOM
 * assertions and scripted interactions: structure and behaviour, not just
 * pixels, so a screenshot pasted as a background image scores nothing on the
 * assertion components.
 *
 * Candidate JS executes ONLY inside headless Chromium with all network
 * requests aborted, never in the API process.
 */
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { round2, type FrontendAssertion, type FrontendConfig, type FrontendInteraction } from "@codeforge/shared";
import type { Page } from "playwright";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { getObjectBuffer, putObject } from "../../lib/s3";
import { parseTypeConfig } from "../settings";

const VIEWPORT_HEIGHT = 800;
const RENDER_SETTLE_MS = 400;

export function buildDocument(html: string, css: string, js: string): string {
  return [
    "<!doctype html><html><head><meta charset='utf-8'>",
    "<meta name='viewport' content='width=device-width, initial-scale=1'>",
    `<style>${css}</style></head><body>`,
    html,
    js.trim() ? `<script>${js}<\/script>` : "",
    "</body></html>",
  ].join("\n");
}

async function newIsolatedPage(width: number) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height: VIEWPORT_HEIGHT } });
  // No external requests: candidate markup cannot exfiltrate or fetch.
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("data:") || url.startsWith("about:")) return route.continue();
    return route.abort();
  });
  return { browser, page };
}

async function renderScreenshot(doc: string, width: number): Promise<Buffer> {
  const { browser, page } = await newIsolatedPage(width);
  try {
    await page.setContent(doc, { waitUntil: "load", timeout: 15_000 });
    await page.waitForTimeout(RENDER_SETTLE_MS);
    return await page.screenshot({ type: "png" });
  } finally {
    await browser.close();
  }
}

/** Render + store reference screenshots for a question (authoring-time job). */
export async function renderReferenceScreenshots(questionId: string): Promise<void> {
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question || question.type !== "frontend_ui") return;
  const cfg = parseTypeConfig<FrontendConfig>("frontend_ui", question.typeConfig);
  if (!cfg || !cfg.referenceHtml.trim()) return;

  const doc = buildDocument(cfg.referenceHtml, cfg.referenceCss, "");
  const keys: Record<string, string> = {};
  for (const width of cfg.breakpoints) {
    const png = await renderScreenshot(doc, width);
    const key = `questions/${questionId}/ref-${width}.png`;
    await putObject(key, png, "image/png");
    keys[String(width)] = key;
  }
  await prisma.question.update({
    where: { id: questionId },
    data: { typeConfig: { ...cfg, referenceScreenshots: keys } as object },
  });
  logger.info({ questionId, breakpoints: cfg.breakpoints }, "reference screenshots rendered");
}

function comparePngs(a: Buffer, b: Buffer): { similarityPct: number; diff: Buffer } {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  const width = Math.min(pa.width, pb.width);
  const height = Math.min(pa.height, pb.height);
  const crop = (src: PNG) => {
    const out = new PNG({ width, height });
    PNG.bitblt(src, out, 0, 0, width, height, 0, 0);
    return out;
  };
  const ca = pa.width === width && pa.height === height ? pa : crop(pa);
  const cb = pb.width === width && pb.height === height ? pb : crop(pb);
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(ca.data, cb.data, diff.data, width, height, { threshold: 0.12 });
  const similarityPct = round2(100 * (1 - mismatched / (width * height)));
  return { similarityPct, diff: PNG.sync.write(diff) };
}

async function runAssertion(page: Page, a: FrontendAssertion): Promise<{ passed: boolean; detail: string }> {
  try {
    switch (a.type) {
      case "exists":
        return { passed: (await page.locator(a.selector).count()) > 0, detail: a.selector };
      case "notExists":
        return { passed: (await page.locator(a.selector).count()) === 0, detail: a.selector };
      case "textContains": {
        const text = (await page.locator(a.selector).first().textContent({ timeout: 3000 })) ?? "";
        return {
          passed: text.toLowerCase().includes((a.text ?? "").toLowerCase()),
          detail: `"${(a.text ?? "").slice(0, 60)}" in ${a.selector}`,
        };
      }
      case "attrEquals": {
        const val = await page.locator(a.selector).first().getAttribute(a.attr ?? "", { timeout: 3000 });
        return { passed: val === a.value, detail: `${a.selector}[${a.attr}] = "${val}"` };
      }
      case "countAtLeast": {
        const count = await page.locator(a.selector).count();
        return { passed: count >= (a.count ?? 1), detail: `${count} of >=${a.count} ${a.selector}` };
      }
    }
  } catch (err) {
    return { passed: false, detail: err instanceof Error ? err.message.slice(0, 200) : "assertion error" };
  }
}

async function runInteraction(page: Page, i: FrontendInteraction): Promise<{ passed: boolean; detail: string }> {
  try {
    const target = page.locator(i.selector).first();
    if (i.action === "click") await target.click({ timeout: 3000 });
    else if (i.action === "hover") await target.hover({ timeout: 3000 });
    else if (i.action === "fill") await target.fill(i.text ?? "", { timeout: 3000 });
    await page.waitForTimeout(250);
    return runAssertion(page, {
      label: i.label,
      type: i.assertType,
      selector: i.assertSelector,
      text: i.assertText,
      attr: i.assertAttr,
      value: i.assertValue,
    });
  } catch (err) {
    return { passed: false, detail: err instanceof Error ? err.message.slice(0, 200) : "interaction error" };
  }
}

export async function gradeFrontendSubmission(
  submission: { id: string; content: string; maxPoints: number },
  question: { id: string; typeConfig: unknown }
): Promise<{ autoScore: number; rows: object[] }> {
  const cfg = parseTypeConfig<FrontendConfig>("frontend_ui", question.typeConfig);
  if (!cfg) throw new Error("Invalid frontend_ui config");

  let parsed: { html?: string; css?: string; js?: string };
  try {
    parsed = JSON.parse(submission.content) as typeof parsed;
  } catch {
    throw new Error("Submission is not valid JSON ({html, css, js})");
  }
  const doc = buildDocument(parsed.html ?? "", parsed.css ?? "", parsed.js ?? "");
  const rows: object[] = [];

  // ---- Visual diff per breakpoint
  let visualSum = 0;
  let visualCount = 0;
  for (const width of cfg.breakpoints) {
    const refKey = cfg.referenceScreenshots[String(width)];
    if (!refKey) continue;
    const [candidatePng, referencePng] = [
      await renderScreenshot(doc, width),
      await getObjectBuffer(refKey),
    ];
    const { similarityPct, diff } = comparePngs(referencePng, candidatePng);
    const candKey = `submissions/${submission.id}/cand-${width}.png`;
    const diffKey = `submissions/${submission.id}/diff-${width}.png`;
    await putObject(candKey, candidatePng, "image/png");
    await putObject(diffKey, diff, "image/png");
    visualSum += similarityPct;
    visualCount++;
    rows.push({
      verdict: similarityPct >= 90 ? "accepted" : "wrong_answer",
      passed: similarityPct >= 90,
      metadata: { kind: "visual", width, similarityPct, candidateKey: candKey, diffKey, referenceKey: refKey },
    });
  }
  const visualPct = visualCount > 0 ? visualSum / visualCount / 100 : null;

  // ---- DOM assertions + interactions (single page, largest breakpoint)
  let assertionPct: number | null = null;
  let interactionPct: number | null = null;
  if (cfg.assertions.length > 0 || cfg.interactions.length > 0) {
    const width = Math.max(...cfg.breakpoints);
    const { browser, page } = await newIsolatedPage(width);
    try {
      await page.setContent(doc, { waitUntil: "load", timeout: 15_000 });
      await page.waitForTimeout(RENDER_SETTLE_MS);

      if (cfg.assertions.length > 0) {
        let passed = 0;
        for (const a of cfg.assertions) {
          const r = await runAssertion(page, a);
          if (r.passed) passed++;
          rows.push({
            verdict: r.passed ? "accepted" : "wrong_answer",
            passed: r.passed,
            metadata: { kind: "assertion", label: a.label, detail: r.detail },
          });
        }
        assertionPct = passed / cfg.assertions.length;
      }
      if (cfg.interactions.length > 0) {
        let passed = 0;
        for (const i of cfg.interactions) {
          const r = await runInteraction(page, i);
          if (r.passed) passed++;
          rows.push({
            verdict: r.passed ? "accepted" : "wrong_answer",
            passed: r.passed,
            metadata: { kind: "interaction", label: i.label, detail: r.detail },
          });
        }
        interactionPct = passed / cfg.interactions.length;
      }
    } finally {
      await browser.close();
    }
  }

  // ---- Weighted composite over the components that are actually configured
  const parts: { pct: number; weight: number }[] = [];
  if (visualPct != null) parts.push({ pct: visualPct, weight: cfg.visualWeightPct });
  if (assertionPct != null) parts.push({ pct: assertionPct, weight: cfg.assertionsWeightPct });
  if (interactionPct != null) parts.push({ pct: interactionPct, weight: cfg.interactionsWeightPct });
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const overall = totalWeight > 0 ? parts.reduce((s, p) => s + p.pct * p.weight, 0) / totalWeight : 0;
  return { autoScore: round2(overall * submission.maxPoints), rows };
}
