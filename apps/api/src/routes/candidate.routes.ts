import { Router, type Request } from "express";
import { z } from "zod";
import {
  CLIENT_EVENT_TYPES,
  HARD_BLOCK_EVENT_LEVELS,
  LANGUAGE_IDS,
  REPO_URL_PATTERN,
  brandingConfigSchema,
  proctoringLimits,
  type ApiChallengeConfig,
  type BugFixConfig,
  type CandidateQuestion,
  type FrontendConfig,
  type ProctoringEventType,
} from "@codeforge/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  asyncHandler,
  badRequest,
  forbidden,
  notFound,
  serviceUnavailable,
} from "../lib/errors";
import { requireCandidate } from "../middleware/candidate";
import { validateBody } from "../middleware/validate";
import { executionLimiter, identityLimiter, supportLimiter } from "../middleware/rateLimit";
import { Judge0UnavailableError } from "../lib/judge0";
import { executeCases } from "../lib/executor";
import { UnsupportedDevLanguageError } from "../lib/dockerExecutor";
import { parseDsaConfig, parseTestSettings, parseTypeConfig } from "../services/settings";
import {
  finalizeSession,
  getQuestionOrder,
  resolveQuestionOrder,
  toCandidateQuestion,
  type QuestionOrderEntry,
} from "../services/session";
import { scheduleAutoSubmit } from "../jobs/queues";
import { refreshSessionIntegrity, severityOf } from "../services/integrity";
import { presignGet, putObject } from "../lib/s3";
import { sendNewSupportTicketEmail } from "../lib/email";
import { syncNewTicketToHq } from "../services/support";
import { logger } from "../lib/logger";

export const candidateRouter = Router();
candidateRouter.use(requireCandidate);

const MAX_IDENTITY_ATTEMPTS = 5;

function ctx(req: Request) {
  return req.candidate!;
}

/** The session must be live: started, not submitted, deadline not passed. */
function assertLive(req: Request) {
  const { session } = ctx(req);
  if (!session || session.status !== "in_progress") {
    throw forbidden("The test is not in progress");
  }
  // 5s grace absorbs network latency at the deadline; the server-side
  // auto-submit job is the real cutoff.
  if (!session.endsAt || session.endsAt.getTime() + 5_000 < Date.now()) {
    throw forbidden("Time is up, the test has been submitted automatically");
  }
  return session;
}

function orderEntryFor(session: { questionOrder: unknown }, questionId: string) {
  const order = (session.questionOrder as unknown as QuestionOrderEntry[]) ?? [];
  const entry = order.find((o) => o.questionId === questionId);
  if (!entry) throw notFound("Question is not part of this test");
  return entry;
}

// ---------------------------------------------------------------------------
// Pre-test: context + identity + start
// ---------------------------------------------------------------------------

candidateRouter.get(
  "/context",
  asyncHandler(async (req, res) => {
    const { invitation, test, session } = ctx(req);
    const settings = parseTestSettings(test.settings);
    const questionCount = await prisma.testQuestion.count({ where: { testId: test.id } });
    const branding = brandingConfigSchema.safeParse(test.org.brandingConfig ?? {});
    const b = branding.success ? branding.data : null;
    res.json({
      serverNow: new Date().toISOString(),
      org: {
        name: b?.displayName || test.org.name,
        tagline: b?.tagline ?? null,
        logoUrl: b?.logoUrl ?? null,
        faviconUrl: b?.faviconUrl ?? null,
        accentColor: b?.accentColor ?? null,
        accentColorHover: b?.accentColorHover ?? null,
        supportEmail: b?.supportEmail ?? null,
        privacyUrl: b?.privacyUrl ?? null,
        hideCodeForgeBranding: b?.hideCodeForgeBranding ?? false,
      },
      test: {
        title: test.title,
        description: test.description,
        durationMinutes: test.durationMinutes,
        instructionsMd: settings.instructionsMd,
        proctoringLevel: test.proctoringLevel,
        schedulingStart: test.schedulingStart,
        schedulingEnd: test.schedulingEnd,
        status: test.status,
        questionCount,
      },
      proctoring: {
        level: test.proctoringLevel,
        limits: proctoringLimits(test.proctoringLevel, settings),
        webcamRequired: ["strict", "lockdown"].includes(test.proctoringLevel),
        fullscreenRequired: test.proctoringLevel !== "none",
      },
      invitation: {
        candidateName: invitation.candidateName,
        candidateEmail: invitation.candidateEmail,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
      session: session
        ? {
            status: session.status,
            startedAt: session.startedAt,
            endsAt: session.endsAt,
            submittedAt: session.submittedAt,
          }
        : null,
    });
  })
);

/**
 * Get-help ticket, reachable from every phase of the candidate flow
 * (pre-test, mid-exam via TestRunner, and the done screen — see
 * apps/web/src/components/candidate/GetHelpModal.tsx). Two channels:
 * "org" reaches this org's own recruiters (a question about the test/role),
 * "codeforge" is a platform/technical problem, dual-written to HQ
 * (services/support.ts) best-effort so a sync hiccup never blocks the
 * candidate's request from being recorded here first.
 */
candidateRouter.post(
  "/support",
  supportLimiter,
  validateBody(
    z.object({
      channel: z.enum(["org", "codeforge"]),
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(5000),
    })
  ),
  asyncHandler(async (req, res) => {
    const { invitation, test, session } = ctx(req);
    const { channel, subject, body } = req.body as { channel: "org" | "codeforge"; subject: string; body: string };

    const ticket = await prisma.supportTicket.create({
      data: {
        orgId: test.orgId,
        channel,
        subject,
        candidateSessionId: session?.id ?? null,
        candidateEmail: invitation.candidateEmail,
        candidateName: invitation.candidateName,
        messages: {
          create: { authorType: "candidate", authorName: invitation.candidateName, body },
        },
      },
    });

    if (channel === "codeforge") {
      syncNewTicketToHq({
        originTicketId: ticket.id,
        subject,
        candidateEmail: invitation.candidateEmail,
        candidateName: invitation.candidateName,
        firstMessage: { authorType: "candidate", authorName: invitation.candidateName, body },
      });
    } else {
      const branding = brandingConfigSchema.safeParse(test.org.brandingConfig ?? {});
      const supportEmail = branding.success ? branding.data.supportEmail : undefined;
      if (supportEmail) {
        sendNewSupportTicketEmail({
          to: supportEmail,
          subject,
          channel: "org",
          fromName: invitation.candidateName,
          body,
          testTitle: test.title,
        }).catch((err) => logger.error({ err, ticketId: ticket.id }, "[support] new-ticket email failed"));
      }
    }

    res.status(201).json({ ok: true, ticketId: ticket.id });
  })
);

/**
 * Lightweight identity confirmation before the test starts (spec 3.1).
 * The provided email must match the invitation; the link locks after
 * MAX_IDENTITY_ATTEMPTS mismatches.
 */
candidateRouter.post(
  "/verify-identity",
  identityLimiter,
  validateBody(
    z.object({ name: z.string().min(1).max(120), email: z.string().email() })
  ),
  asyncHandler(async (req, res) => {
    const { invitation, session } = ctx(req);
    if (session && session.status !== "created") {
      throw badRequest("The test has already been started with this link");
    }
    const { name, email } = req.body as { name: string; email: string };

    if (email.toLowerCase() !== invitation.candidateEmail.toLowerCase()) {
      const failed = invitation.failedAttempts + 1;
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: {
          failedAttempts: failed,
          ...(failed >= MAX_IDENTITY_ATTEMPTS ? { status: "revoked" as const } : {}),
        },
      });
      if (failed >= MAX_IDENTITY_ATTEMPTS) {
        throw forbidden("Too many failed attempts. This link is now locked. Contact the recruiter.");
      }
      throw badRequest(
        `The email doesn't match this invitation (${MAX_IDENTITY_ATTEMPTS - failed} attempts left)`
      );
    }

    await prisma.$transaction(async (tx) => {
      if (!session) {
        await tx.testSession.create({
          data: {
            invitationId: invitation.id,
            testId: invitation.testId,
            candidateName: name,
            candidateEmail: invitation.candidateEmail,
            status: "created",
          },
        });
      } else {
        await tx.testSession.update({
          where: { id: session.id },
          data: { candidateName: name },
        });
      }
      if (invitation.status === "pending") {
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { status: "opened" },
        });
      }
    });
    res.json({ ok: true });
  })
);

candidateRouter.post(
  "/start",
  asyncHandler(async (req, res) => {
    const { invitation, test, session } = ctx(req);
    if (!session) throw badRequest("Confirm your identity first");
    if (session.status !== "created") throw badRequest("The test was already started");
    if (test.status !== "published") {
      throw forbidden("This test is not currently accepting submissions");
    }
    const now = new Date();
    if (test.schedulingStart && now < test.schedulingStart) {
      throw forbidden("The test window has not opened yet");
    }
    if (test.schedulingEnd && now > test.schedulingEnd) {
      throw forbidden("The test window has closed");
    }
    if (invitation.expiresAt < now) throw forbidden("This invitation has expired");

    const order = await resolveQuestionOrder(test.id);
    if (order.length === 0) throw badRequest("This test has no questions configured");

    let endsAt = new Date(now.getTime() + test.durationMinutes * 60_000);
    if (test.schedulingEnd && endsAt > test.schedulingEnd) endsAt = test.schedulingEnd;

    const updated = await prisma.testSession.update({
      where: { id: session.id },
      data: {
        status: "in_progress",
        startedAt: now,
        endsAt,
        questionOrder: order as unknown as Prisma.InputJsonValue,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]?.slice(0, 500) ?? null,
      },
    });
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "started" },
    });
    // Server-side deadline enforcement: never trust the client timer.
    await scheduleAutoSubmit(session.id, endsAt);

    res.json({ session: { status: updated.status, startedAt: updated.startedAt, endsAt: updated.endsAt } });
  })
);

// ---------------------------------------------------------------------------
// In-test: state + autosave + run + submit + finish
// ---------------------------------------------------------------------------

candidateRouter.get(
  "/state",
  asyncHandler(async (req, res) => {
    let { session } = ctx(req);
    const { test } = ctx(req);
    if (!session || session.status === "created") {
      throw badRequest("The test has not been started");
    }

    // Deadline passed but the auto-submit job hasn't fired yet? Finalize now.
    if (
      session.status === "in_progress" &&
      session.endsAt &&
      session.endsAt.getTime() + 5_000 < Date.now()
    ) {
      await finalizeSession(session.id, "auto");
      session = (await prisma.testSession.findUniqueOrThrow({ where: { id: session.id } }));
    }

    const settings = parseTestSettings(test.settings);
    const order = getQuestionOrder(session);
    const questions = await prisma.question.findMany({
      where: { id: { in: order.map((o) => o.questionId) } },
      include: { testCases: { orderBy: { orderIndex: "asc" } } },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));

    const candidateQuestions: CandidateQuestion[] = order
      .slice()
      .sort((a, b) => a.order - b.order)
      .flatMap((entry) => {
        const q = byId.get(entry.questionId);
        return q ? [toCandidateQuestion(entry, q, settings.allowedLanguages)] : [];
      });

    // Frontend questions: hand the candidate short-lived URLs for the
    // reference design screenshots (the reference HTML/CSS never leaves the API).
    for (const cq of candidateQuestions) {
      if (cq.type !== "frontend_ui") continue;
      const q = byId.get(cq.questionId);
      const cfg = q ? parseTypeConfig<FrontendConfig>("frontend_ui", q.typeConfig) : null;
      if (!cfg) continue;
      const urls: Record<string, string> = {};
      for (const [width, key] of Object.entries(cfg.referenceScreenshots)) {
        urls[width] = await presignGet(key);
      }
      cq.referenceImageUrls = urls;
    }

    const drafts = await prisma.answerDraft.findMany({ where: { sessionId: session.id } });
    const submissions = await prisma.submission.findMany({
      where: { sessionId: session.id, kind: "submit" },
      select: { questionId: true, version: true, submittedAt: true },
      orderBy: { version: "asc" },
    });
    const submissionSummary: Record<string, { count: number; lastSubmittedAt: Date }> = {};
    for (const s of submissions) {
      submissionSummary[s.questionId] = {
        count: (submissionSummary[s.questionId]?.count ?? 0) + 1,
        lastSubmittedAt: s.submittedAt,
      };
    }

    res.json({
      serverNow: new Date().toISOString(),
      session: {
        id: session.id,
        status: session.status,
        startedAt: session.startedAt,
        endsAt: session.endsAt,
        submittedAt: session.submittedAt,
        currentQuestionId: session.currentQuestionId,
      },
      test: { title: test.title, durationMinutes: test.durationMinutes },
      questions: candidateQuestions,
      drafts: Object.fromEntries(
        drafts.map((d) => [
          d.questionId,
          { content: d.content, language: d.language, updatedAt: d.updatedAt },
        ])
      ),
      submissions: submissionSummary,
    });
  })
);

/** Debounced autosave: server-side state is the source of truth (spec 3.4.5). */
candidateRouter.put(
  "/questions/:questionId/draft",
  validateBody(
    z.object({
      content: z.string().max(400_000),
      language: z.enum(LANGUAGE_IDS as [string, ...string[]]).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const session = assertLive(req);
    orderEntryFor(session, req.params.questionId);
    const { content, language } = req.body as { content: string; language?: string };
    await prisma.$transaction([
      prisma.answerDraft.upsert({
        where: {
          sessionId_questionId: { sessionId: session.id, questionId: req.params.questionId },
        },
        create: {
          sessionId: session.id,
          questionId: req.params.questionId,
          content,
          language,
        },
        update: { content, language },
      }),
      prisma.testSession.update({
        where: { id: session.id },
        data: { currentQuestionId: req.params.questionId },
      }),
    ]);
    res.json({ savedAt: new Date().toISOString() });
  })
);

/** "Run": execute against the visible sample cases only (spec 3.4.4). */
candidateRouter.post(
  "/questions/:questionId/run",
  executionLimiter,
  validateBody(
    z.object({
      code: z.string().min(1).max(200_000),
      language: z.enum(LANGUAGE_IDS as [string, ...string[]]),
    })
  ),
  asyncHandler(async (req, res) => {
    const session = assertLive(req);
    orderEntryFor(session, req.params.questionId);
    const question = await prisma.question.findFirst({
      where: { id: req.params.questionId, type: "dsa" },
      include: { testCases: { where: { isHidden: false }, orderBy: { orderIndex: "asc" } } },
    });
    if (!question) throw notFound("Question not found");
    if (question.testCases.length === 0) {
      throw badRequest("This question has no sample cases to run against, use Submit");
    }
    assertLanguageAllowed(req, question.typeConfig, req.body.language);

    const cfg = parseDsaConfig(question.typeConfig);
    try {
      const outcomes = await executeCases({
        languageId: req.body.language,
        sourceCode: req.body.code,
        cases: question.testCases.map((tc) => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
        })),
        timeLimitMs: cfg.timeLimitMs,
        memoryLimitKb: cfg.memoryLimitKb,
      });

      // Persist the run for the audit trail (and Phase 2 session replay).
      const runCount = await prisma.submission.count({
        where: { sessionId: session.id, questionId: question.id, kind: "run" },
      });
      await prisma.submission.create({
        data: {
          sessionId: session.id,
          questionId: question.id,
          kind: "run",
          content: req.body.code,
          language: req.body.language,
          version: runCount + 1,
          status: "graded",
          gradedAt: new Date(),
          judgeResults: {
            create: outcomes.map((o, i) => ({
              testCaseId: question.testCases[i].id,
              judge0Token: o.token,
              verdict: o.verdict,
              passed: o.passed,
              stdout: o.stdout,
              stderr: o.stderr,
              compileOutput: o.compileOutput,
              timeMs: o.timeMs,
              memoryKb: o.memoryKb,
            })),
          },
        },
      });

      res.json({
        results: outcomes.map((o, i) => ({
          input: question.testCases[i].input,
          expectedOutput: question.testCases[i].expectedOutput,
          stdout: o.stdout,
          stderr: o.stderr,
          compileOutput: o.compileOutput,
          verdict: o.verdict,
          passed: o.passed,
          timeMs: o.timeMs,
          memoryKb: o.memoryKb,
        })),
      });
    } catch (err) {
      if (err instanceof UnsupportedDevLanguageError) throw badRequest(err.message);
      if (err instanceof Judge0UnavailableError) {
        throw serviceUnavailable(
          "The code runner is temporarily unavailable. Your code is autosaved, try again shortly."
        );
      }
      throw err;
    }
  })
);

/**
 * "Submit": queue grading against the full hidden suite. Accepts any
 * gradeable type: dsa/api code, frontend {html,css,js} JSON, bug-fix
 * {files} JSON, or a repository URL.
 */
candidateRouter.post(
  "/questions/:questionId/submit",
  executionLimiter,
  validateBody(
    z.object({
      // `code` kept as an alias of `content` for the coding workspaces
      code: z.string().max(400_000).optional(),
      content: z.string().max(400_000).optional(),
      language: z.enum(LANGUAGE_IDS as [string, ...string[]]).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const session = assertLive(req);
    const entry = orderEntryFor(session, req.params.questionId);
    const question = await prisma.question.findFirst({
      where: { id: req.params.questionId, type: { not: "mcq" } },
    });
    if (!question) throw notFound("Question not found");

    const body = req.body as { code?: string; content?: string; language?: string };
    const content = (body.content ?? body.code ?? "").trim();
    if (!content) throw badRequest("Nothing to submit");
    validateSubmissionContent(question.type, content);
    if (question.type === "dsa") {
      if (!body.language) throw badRequest("Pick a language before submitting");
      assertLanguageAllowed(req, question.typeConfig, body.language);
    }

    const previous = await prisma.submission.count({
      where: { sessionId: session.id, questionId: question.id, kind: "submit" },
    });
    const submission = await prisma.submission.create({
      data: {
        sessionId: session.id,
        questionId: question.id,
        kind: "submit",
        content,
        language: body.language,
        version: previous + 1,
        status: "queued",
        maxPoints: entry.points,
      },
    });
    // Keep the draft in sync so the latest work survives a refresh.
    await prisma.answerDraft.upsert({
      where: {
        sessionId_questionId: { sessionId: session.id, questionId: question.id },
      },
      create: { sessionId: session.id, questionId: question.id, content, language: body.language },
      update: { content, language: body.language },
    });
    const { enqueueGradeSubmission } = await import("../jobs/queues");
    await enqueueGradeSubmission(submission.id);
    res.status(201).json({ submissionId: submission.id, version: submission.version });
  })
);

function validateSubmissionContent(type: string, content: string): void {
  if (type === "frontend_ui") {
    try {
      JSON.parse(content);
    } catch {
      throw badRequest("Frontend submissions must be JSON ({html, css, js})");
    }
  }
  if (type === "bug_fix") {
    try {
      const parsed = JSON.parse(content) as { files?: unknown };
      if (!parsed.files || typeof parsed.files !== "object") throw new Error("no files");
    } catch {
      throw badRequest("Bug-fix submissions must be JSON ({files})");
    }
  }
  if (type === "repo_project" && !REPO_URL_PATTERN.test(content)) {
    throw badRequest("Submit a public https GitHub/GitLab/Bitbucket repository URL");
  }
}

/** Dry-run clone/inspect for repo submissions (spec 3.4.4 "Validate"). */
candidateRouter.post(
  "/questions/:questionId/validate-repo",
  executionLimiter,
  validateBody(z.object({ url: z.string().min(10).max(500) })),
  asyncHandler(async (req, res) => {
    const session = assertLive(req);
    orderEntryFor(session, req.params.questionId);
    const question = await prisma.question.findFirst({
      where: { id: req.params.questionId, type: "repo_project" },
    });
    if (!question) throw notFound("Question not found");
    const { validateRepo } = await import("../services/appdev/repoProject");
    const result = await validateRepo(req.body.url as string);
    res.json(result);
  })
);

candidateRouter.post(
  "/finish",
  asyncHandler(async (req, res) => {
    const { session } = ctx(req);
    if (!session) throw badRequest("The test has not been started");
    if (["submitted", "auto_submitted"].includes(session.status)) {
      res.json({ status: session.status, submittedAt: session.submittedAt });
      return;
    }
    await finalizeSession(session.id, "manual");
    const updated = await prisma.testSession.findUniqueOrThrow({ where: { id: session.id } });
    res.json({ status: updated.status, submittedAt: updated.submittedAt });
  })
);

// ---------------------------------------------------------------------------
// Phase 2: proctoring events, editor replay stream, webcam snapshots
// ---------------------------------------------------------------------------

const eventBatchSchema = z.object({
  events: z
    .array(
      z.object({
        type: z.enum(CLIENT_EVENT_TYPES as unknown as [string, ...string[]]),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .min(1)
    .max(50),
});

/**
 * Batched proctoring events from the candidate client. Everything is logged
 * as a timestamped timeline row; the only automated consequence is the
 * configured tab-switch / fullscreen-exit force-submit (spec 3.5); the
 * integrity score itself never auto-rejects anyone.
 */
candidateRouter.post(
  "/events",
  validateBody(eventBatchSchema),
  asyncHandler(async (req, res) => {
    const { session, test } = ctx(req);
    if (!session || !["created", "in_progress"].includes(session.status)) {
      throw forbidden("The session does not accept events");
    }
    const events = (req.body as z.infer<typeof eventBatchSchema>).events;

    await prisma.proctoringEvent.createMany({
      data: events.map((e) => ({
        sessionId: session.id,
        eventType: e.type,
        severity: severityOf(e.type as ProctoringEventType),
        metadata: (e.metadata ?? {}) as Prisma.InputJsonValue,
      })),
    });
    await refreshSessionIntegrity(session.id);

    // Threshold enforcement (only while the test is running).
    let forceSubmitted = false;
    const warnings: { type: string; count: number; limit: number }[] = [];
    if (session.status === "in_progress") {
      const settings = parseTestSettings(test.settings);
      const limits = proctoringLimits(test.proctoringLevel, settings);
      const enforced: { type: ProctoringEventType; limit?: number }[] = [
        { type: "tab_switch", limit: limits.maxTabSwitches },
        { type: "fullscreen_exit", limit: limits.maxFullscreenExits },
      ];
      for (const rule of enforced) {
        if (!rule.limit) continue;
        if (!events.some((e) => e.type === rule.type)) continue;
        const count = await prisma.proctoringEvent.count({
          where: { sessionId: session.id, eventType: rule.type },
        });
        if (count > rule.limit && !forceSubmitted) {
          await prisma.proctoringEvent.create({
            data: {
              sessionId: session.id,
              eventType: "integrity_auto_submit",
              severity: 3,
              metadata: { rule: rule.type, count, limit: rule.limit } as Prisma.InputJsonValue,
            },
          });
          await finalizeSession(session.id, "auto");
          forceSubmitted = true;
        } else if (count >= rule.limit - 1) {
          warnings.push({ type: rule.type, count, limit: rule.limit });
        }
      }

      // Immediate-trigger hardware/environment checks: unlike the threshold
      // rules above, these force-submit on first occurrence at the
      // configured proctoring level, since automation-browser and
      // virtual-camera detection have a low enough false-positive rate to
      // warrant it (see HARD_BLOCK_EVENT_LEVELS doc comment). Everything
      // else from the hardware-check batch only ever scores a deduction via
      // EVENT_DEFS, never force-submits.
      if (!forceSubmitted) {
        for (const e of events) {
          const blockLevels = HARD_BLOCK_EVENT_LEVELS[e.type as ProctoringEventType];
          if (!blockLevels?.includes(test.proctoringLevel)) continue;
          await prisma.proctoringEvent.create({
            data: {
              sessionId: session.id,
              eventType: "integrity_auto_submit",
              severity: 3,
              metadata: { rule: e.type, level: test.proctoringLevel } as Prisma.InputJsonValue,
            },
          });
          await finalizeSession(session.id, "auto");
          forceSubmitted = true;
          break;
        }
      }
    }
    res.json({ ok: true, forceSubmitted, warnings });
  })
);

const editorOpsSchema = z.object({
  questionId: z.string().min(1),
  ops: z
    .array(
      z.object({
        t: z.number().int().min(0), // ms since recording started
        o: z.number().int().min(0), // char offset
        d: z.number().int().min(0), // deleted char count
        i: z.string().max(20_000), // inserted text
        init: z.boolean().optional(), // initial editor content, not typed
      })
    )
    .min(1)
    .max(500),
});

/** Keystroke-level deltas for session replay (spec 3.5). */
candidateRouter.post(
  "/editor-events",
  validateBody(editorOpsSchema),
  asyncHandler(async (req, res) => {
    const session = assertLive(req);
    const { questionId, ops } = req.body as z.infer<typeof editorOpsSchema>;
    orderEntryFor(session, questionId);

    const seq = await prisma.editorEventBatch.count({
      where: { sessionId: session.id, questionId },
    });
    await prisma.editorEventBatch.create({
      data: {
        sessionId: session.id,
        questionId,
        seq: seq + 1,
        ops: ops as unknown as Prisma.InputJsonValue,
      },
    });

    // Server-side paste heuristic: a single non-init op inserting a large
    // block was almost certainly pasted, not typed (spec: log intent, don't
    // silently swallow).
    const pastes = ops.filter((op) => !op.init && op.i.length >= 120);
    if (pastes.length > 0) {
      await prisma.proctoringEvent.createMany({
        data: pastes.slice(0, 5).map((op) => ({
          sessionId: session.id,
          eventType: "large_paste",
          severity: severityOf("large_paste"),
          metadata: { questionId, chars: op.i.length } as Prisma.InputJsonValue,
        })),
      });
      await refreshSessionIntegrity(session.id);
    }
    res.json({ ok: true });
  })
);

const snapshotSchema = z.object({
  imageBase64: z.string().min(100).max(2_000_000), // ~1.5 MB decoded cap
  facePresent: z.boolean().nullable().default(null),
  // Raw count from the browser's FaceDetector API (maxDetectedFaces: 2, see
  // apps/web/src/lib/proctoring.ts); null when the API isn't available.
  facesDetected: z.number().int().min(0).max(2).nullable().default(null),
  kind: z.enum(["identity", "interval", "event"]).default("interval"),
});

/** Webcam snapshot upload (strict/lockdown levels): stored in MinIO/S3. */
candidateRouter.post(
  "/snapshot",
  validateBody(snapshotSchema),
  asyncHandler(async (req, res) => {
    const { session, test } = ctx(req);
    if (!session || !["created", "in_progress"].includes(session.status)) {
      throw forbidden("The session does not accept snapshots");
    }
    if (!["strict", "lockdown"].includes(test.proctoringLevel)) {
      throw badRequest("This test's proctoring level does not capture snapshots");
    }
    const { imageBase64, facePresent, facesDetected, kind } = req.body as z.infer<typeof snapshotSchema>;
    const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(b64, "base64");
    if (buffer.length < 100 || buffer.length > 1_500_000) {
      throw badRequest("Snapshot size out of bounds");
    }
    const key = `sessions/${session.id}/${kind}-${Date.now()}.jpg`;
    await putObject(key, buffer, "image/jpeg");
    await prisma.proctoringEvent.create({
      data: {
        sessionId: session.id,
        eventType: kind === "identity" ? "identity_snapshot" : "webcam_snapshot",
        severity: 0,
        metadata: { key, facePresent, facesDetected, kind } as Prisma.InputJsonValue,
      },
    });
    // A confirmed missing face, or a second face in frame, is its own
    // (penalized) signal, alongside the descriptive snapshot event above.
    if (facePresent === false) {
      await prisma.proctoringEvent.create({
        data: {
          sessionId: session.id,
          eventType: "face_absent",
          severity: severityOf("face_absent"),
          metadata: { key } as Prisma.InputJsonValue,
        },
      });
      await refreshSessionIntegrity(session.id);
    } else if (facesDetected !== null && facesDetected > 1) {
      await prisma.proctoringEvent.create({
        data: {
          sessionId: session.id,
          eventType: "multiple_faces_detected",
          severity: severityOf("multiple_faces_detected"),
          metadata: { key, facesDetected } as Prisma.InputJsonValue,
        },
      });
      await refreshSessionIntegrity(session.id);
    }
    res.status(201).json({ ok: true });
  })
);

// ---------------------------------------------------------------------------

function assertLanguageAllowed(req: Request, typeConfig: unknown, language: string) {
  const { test } = ctx(req);
  const settings = parseTestSettings(test.settings);
  const cfg = parseDsaConfig(typeConfig);
  const perQuestion = cfg.languages;
  if (perQuestion.length > 0 && !perQuestion.includes(language)) {
    throw badRequest(`Language "${language}" is not allowed for this question`);
  }
  if (settings.allowedLanguages.length > 0 && !settings.allowedLanguages.includes(language)) {
    throw badRequest(`Language "${language}" is not allowed in this test`);
  }
}
