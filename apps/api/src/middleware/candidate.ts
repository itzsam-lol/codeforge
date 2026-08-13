import type { NextFunction, Request, Response } from "express";
import type { Invitation, Organization, Test, TestSession } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { unauthorized, forbidden } from "../lib/errors";
import { hashToken } from "../lib/tokens";

export interface CandidateContext {
  invitation: Invitation;
  test: Test & { org: Organization };
  session: TestSession | null;
}

declare module "express-serve-static-core" {
  interface Request {
    candidate?: CandidateContext;
  }
}

/**
 * Candidate authentication: an opaque capability token from the emailed link,
 * sent as the `x-candidate-token` header. No account or password involved.
 */
export function requireCandidate(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers["x-candidate-token"];
  if (typeof token !== "string" || token.length < 32) {
    return next(unauthorized("Missing candidate token"));
  }

  // OR-matched: new invitations only set tokenHash, legacy ones (created
  // before hashing was added) only have the raw `token` — see the schema
  // comment on Invitation.tokenHash.
  prisma.invitation
    .findFirst({
      where: { OR: [{ tokenHash: hashToken(token) }, { token }] },
      include: { test: { include: { org: true } }, session: true },
    })
    .then((invitation) => {
      if (!invitation) return next(unauthorized("This test link is not valid"));
      if (invitation.status === "revoked") {
        return next(forbidden("This test link has been revoked. Contact the recruiter."));
      }
      const submitted =
        invitation.session &&
        ["submitted", "auto_submitted"].includes(invitation.session.status);
      // Allow expired links to view an already-submitted confirmation, but not
      // to start or continue working.
      if (!submitted && invitation.expiresAt < new Date() && !invitation.session?.endsAt) {
        return next(forbidden("This test link has expired. Contact the recruiter."));
      }
      req.candidate = {
        invitation,
        test: invitation.test,
        session: invitation.session,
      };
      next();
    })
    .catch(next);
}
