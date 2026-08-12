import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { ROLES, PERMISSIONS } from "@codeforge/shared";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, conflict, notFound } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { audit } from "../services/audit";

/** Org staff management, including granular permissions: super_admin only. */
export const userRouter = Router();

userRouter.use(requireAuth, requireRole("super_admin"));

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  permissions: true,
  isActive: true,
  createdAt: true,
} as const;

userRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { orgId: req.user!.orgId },
      select: USER_SELECT,
      orderBy: { createdAt: "asc" },
    });
    res.json({ users });
  })
);

userRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
      select: USER_SELECT,
    });
    if (!user) throw notFound("User not found");
    res.json({ user });
  })
);

const createBodySchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(ROLES),
  // Empty/omitted = unrestricted within `role` (see schema comment on
  // User.permissions) — the default for a normal recruiter/reviewer account.
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).default([]),
});

userRouter.post(
  "/",
  validateBody(createBodySchema),
  asyncHandler(async (req, res) => {
    const { name, email, password, role, permissions } = req.body as z.infer<typeof createBodySchema>;
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) throw conflict("A user with this email already exists");
    const user = await prisma.user.create({
      data: {
        orgId: req.user!.orgId,
        name,
        email: email.toLowerCase(),
        passwordHash: await bcrypt.hash(password, 12),
        role,
        permissions,
      },
      select: USER_SELECT,
    });
    await audit(req.user!.orgId, req.user!.id, "user.create", "user", user.id, { role, permissions, email: user.email });
    res.status(201).json({ user });
  })
);

const updateBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(ROLES).optional(),
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).optional(),
  isActive: z.boolean().optional(),
});

userRouter.put(
  "/:id",
  validateBody(updateBodySchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
    });
    if (!existing) throw notFound("User not found");
    if (existing.id === req.user!.id && req.body.isActive === false) {
      throw badRequest("You can't deactivate your own account");
    }
    if (existing.id === req.user!.id && req.body.role && req.body.role !== "super_admin") {
      throw badRequest("You can't remove your own super_admin role");
    }

    const body = req.body as z.infer<typeof updateBodySchema>;
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        role: body.role,
        permissions: body.permissions,
        isActive: body.isActive,
      },
      select: USER_SELECT,
    });
    // A revoked/narrowed account otherwise keeps full authority under its
    // already-issued access token until that token's own TTL expires
    // (requireAuth trusts the JWT's claims, not a live DB read — see
    // middleware/auth.ts). Revoking refresh tokens can't recall a token
    // already in someone's hands, but it closes the "stays logged in
    // indefinitely via silent refresh" gap: the next refresh attempt fails
    // and forces a real re-login, which re-reads the current role/
    // permissions/isActive from the DB.
    if (body.isActive !== undefined || body.role !== undefined || body.permissions !== undefined) {
      await prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await audit(req.user!.orgId, req.user!.id, "user.update", "user", user.id, body);
    res.json({ user });
  })
);
