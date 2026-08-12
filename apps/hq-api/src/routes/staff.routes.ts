import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HQ_PERMISSIONS } from "../lib/permissions";
import { asyncHandler, badRequest, forbidden, notFound } from "../lib/errors";
import { requireAuth, requireOwner } from "../middleware/auth";
import { validateBody } from "../middleware/validate";

const STAFF_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  permissions: true,
  isActive: true,
  createdAt: true,
} as const;

export const staffRouter = Router();
staffRouter.use(requireAuth, requireOwner);

staffRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const staff = await prisma.hqStaff.findMany({ select: STAFF_SELECT, orderBy: { createdAt: "asc" } });
    res.json({ staff });
  })
);

staffRouter.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const staff = await prisma.hqStaff.findUnique({ where: { id: req.params.id }, select: STAFF_SELECT });
    if (!staff) throw notFound("Staff account not found");
    res.json({ staff });
  })
);

staffRouter.post(
  "/",
  validateBody(
    z.object({
      name: z.string().min(1).max(200),
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(["owner", "staff"]),
      permissions: z.array(z.enum(HQ_PERMISSIONS)).default([]),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password, role, permissions } = req.body as {
      name: string;
      email: string;
      password: string;
      role: "owner" | "staff";
      permissions: string[];
    };
    const existing = await prisma.hqStaff.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) throw badRequest("An account with that email already exists");
    const staff = await prisma.hqStaff.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash: await bcrypt.hash(password, 12),
        role,
        permissions,
      },
      select: STAFF_SELECT,
    });
    res.status(201).json({ staff });
  })
);

staffRouter.put(
  "/:id",
  validateBody(
    z.object({
      name: z.string().min(1).max(200).optional(),
      role: z.enum(["owner", "staff"]).optional(),
      permissions: z.array(z.enum(HQ_PERMISSIONS)).optional(),
      isActive: z.boolean().optional(),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const target = await prisma.hqStaff.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound("Staff account not found");
    const body = req.body as { name?: string; role?: "owner" | "staff"; permissions?: string[]; isActive?: boolean };

    if (target.id === req.staff!.id) {
      if (body.isActive === false) throw forbidden("You cannot deactivate your own account");
      if (body.role === "staff" && target.role === "owner") {
        throw forbidden("You cannot demote yourself out of the owner role");
      }
    }

    const staff = await prisma.hqStaff.update({
      where: { id: target.id },
      data: {
        name: body.name,
        role: body.role,
        permissions: body.permissions,
        isActive: body.isActive,
      },
      select: STAFF_SELECT,
    });
    // Same rationale as apps/api/src/routes/user.routes.ts: requireAuth
    // trusts the JWT's claims, not a live DB read, so a revoked/narrowed
    // account otherwise keeps its already-issued access token's authority
    // until it expires. Revoking refresh tokens forces the next refresh to
    // fail and requires a real re-login, which re-reads current state.
    if (body.isActive !== undefined || body.role !== undefined || body.permissions !== undefined) {
      await prisma.hqRefreshToken.updateMany({
        where: { staffId: staff.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.json({ staff });
  })
);
