import { Router } from "express";
import { brandingConfigSchema, publicBrandingSchema } from "@codeforge/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/errors";
import { requireAuth, requireStaffRead, requireStaffWrite, requirePermission } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { audit } from "../services/audit";

/** Organization profile: name + branding, for the recruiter dashboard AND
 * (via /public) the pre-auth chrome (login page, browser tab, candidate
 * pages). CodeForge ships one org per deployment (spec: self-hosted,
 * white-labeled per client), so "the org" is unambiguous without auth. */
export const orgRouter = Router();

/**
 * Public-safe branding for pre-auth screens: the recruiter login page and
 * the root layout's tab title/favicon. Deliberately excludes anything not
 * meant for a logged-out visitor (supportEmail, privacyUrl, the org's raw
 * `name` if a displayName override exists) — see publicBrandingSchema.
 */
orgRouter.get(
  "/public",
  asyncHandler(async (_req, res) => {
    const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    const parsed = publicBrandingSchema.safeParse(org?.brandingConfig ?? {});
    const branding = parsed.success ? parsed.data : publicBrandingSchema.parse({});
    res.json({
      name: branding.displayName || org?.name || "CodeForge",
      ...branding,
    });
  })
);

orgRouter.use(requireAuth);

orgRouter.get(
  "/",
  requireStaffRead,
  asyncHandler(async (req, res) => {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.user!.orgId } });
    res.json({ org: { id: org.id, name: org.name, branding: org.brandingConfig } });
  })
);

orgRouter.put(
  "/",
  requireStaffWrite,
  requirePermission("settings"),
  validateBody(brandingConfigSchema),
  asyncHandler(async (req, res) => {
    const org = await prisma.organization.update({
      where: { id: req.user!.orgId },
      data: { brandingConfig: req.body as Prisma.InputJsonValue },
    });
    await audit(req.user!.orgId, req.user!.id, "org.branding.update", "organization", org.id, req.body);
    res.json({ org: { id: org.id, name: org.name, branding: org.brandingConfig } });
  })
);
