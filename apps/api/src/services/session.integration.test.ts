/**
 * Integration test against a real Postgres database (DATABASE_URL must
 * point at a disposable test DB — see package.json's test:integration
 * script, and .github/workflows/ci.yml's `postgres` service).
 *
 * finalizeSession's own doc comment claims: "Idempotent: an atomic status
 * claim ensures exactly one caller finalizes even if the job and the
 * candidate race." That claim had never been verified — the only thing
 * standing between "exactly one caller finalizes" and "a candidate's
 * session gets double-graded, double-emailed, and double-enqueued" was a
 * single `updateMany({ where: { status: "in_progress" } })` nobody had
 * exercised concurrently.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// finalizeSession's real job is the atomic status claim; email/notification/
// queue side effects are exercised elsewhere (or not worth a live Redis/SMTP
// dependency here) — stub them so this test verifies the claim itself, not
// the machinery around it.
vi.mock("../lib/email", () => ({ sendCandidateCompletionEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./notifications", () => ({ notifyResultsReadyIfComplete: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./integrity", () => ({ refreshSessionIntegrity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../jobs/queues", () => ({
  enqueueGradeSubmission: vi.fn().mockResolvedValue(undefined),
  cancelAutoSubmit: vi.fn().mockResolvedValue(undefined),
  enqueueScanSession: vi.fn().mockResolvedValue(undefined),
}));

const { prisma } = await import("../lib/prisma");
const { finalizeSession } = await import("./session");

describe("finalizeSession concurrency (integration)", () => {
  let orgId: string;
  let userId: string;
  let questionId: string;
  let testId: string;
  let invitationId: string;
  let sessionId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Test Org" } });
    orgId = org.id;

    const user = await prisma.user.create({
      data: {
        orgId,
        role: "recruiter",
        email: `finalize-test-${Date.now()}@example.com`,
        passwordHash: "x",
        name: "Test Recruiter",
      },
    });
    userId = user.id;

    const question = await prisma.question.create({
      data: {
        orgId,
        type: "mcq",
        title: "Test MCQ",
        bodyMd: "2 + 2 = ?",
        difficulty: "easy",
        createdById: userId,
        typeConfig: {
          options: [
            { id: "a", textMd: "3" },
            { id: "b", textMd: "4" },
          ],
          correctOptionIds: ["b"],
          multiple: false,
          negativeMarkingPct: 0,
        },
      },
    });
    questionId = question.id;

    const test = await prisma.test.create({
      data: {
        orgId,
        title: "Finalize race test",
        durationMinutes: 30,
        status: "published",
        createdById: userId,
        questions: { create: [{ questionId, orderIndex: 0, points: 10 }] },
      },
    });
    testId = test.id;

    const invitation = await prisma.invitation.create({
      data: {
        testId,
        candidateEmail: "candidate@example.com",
        candidateName: "Race Candidate",
        tokenHash: `test-hash-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86_400_000),
        status: "started",
      },
    });
    invitationId = invitation.id;

    const session = await prisma.testSession.create({
      data: {
        invitationId,
        testId,
        candidateName: "Race Candidate",
        candidateEmail: "candidate@example.com",
        status: "in_progress",
        startedAt: new Date(),
        endsAt: new Date(Date.now() + 60_000),
        questionOrder: [{ questionId, points: 10, order: 0 }],
      },
    });
    sessionId = session.id;
  });

  afterAll(async () => {
    // FK cascades from Invitation -> TestSession -> Submission, and from
    // Test -> TestQuestion, handle most of this, but delete top-down
    // explicitly rather than relying on cascade order being right.
    await prisma.invitation.delete({ where: { id: invitationId } }).catch(() => undefined);
    await prisma.test.delete({ where: { id: testId } }).catch(() => undefined);
    await prisma.question.delete({ where: { id: questionId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("finalizes exactly once when two callers race on the same in_progress session", async () => {
    // Simulates the real race this guards against: the auto-submit job firing
    // at the exact moment the candidate also clicks Submit.
    const [resultA, resultB] = await Promise.all([
      finalizeSession(sessionId, "manual"),
      finalizeSession(sessionId, "auto"),
    ]);

    // Exactly one of the two racing callers must have won the claim.
    expect([resultA, resultB].filter(Boolean)).toHaveLength(1);

    const final = await prisma.testSession.findUniqueOrThrow({ where: { id: sessionId } });
    // Whichever caller won, the session must have landed in a real terminal
    // state, not been left in_progress or double-transitioned.
    expect(["submitted", "auto_submitted"]).toContain(final.status);
    expect(final.submittedAt).not.toBeNull();

    // The MCQ submission must exist exactly once, not once per racing caller
    // (this is what would double if the atomic claim didn't hold — a second
    // finalize pass would create a second submission row for the question).
    const submissions = await prisma.submission.findMany({ where: { sessionId, questionId } });
    expect(submissions).toHaveLength(1);
    expect(submissions[0].autoScore).toBe(0); // no draft was ever saved -> unanswered -> 0, not penalized
  });

  it("returns false on a third call now that the session is already finalized", async () => {
    const result = await finalizeSession(sessionId, "manual");
    expect(result).toBe(false);
  });
});
