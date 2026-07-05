import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, conflict } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";

/** Org staff management — super_admin only (Section 2). */
export const userRouter = Router();

userRouter.use(requireAuth, requireRole("super_admin"));

userRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { orgId: req.user!.orgId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    res.json({ users });
  })
);

userRouter.post(
  "/",
  validateBody(
    z.object({
      name: z.string().min(1).max(100),
      email: z.string().email(),
      password: z.string().min(8).max(128),
      role: z.enum(["super_admin", "recruiter", "reviewer"]),
    })
  ),
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) throw conflict("A user with this email already exists");
    const user = await prisma.user.create({
      data: {
        orgId: req.user!.orgId,
        name,
        email: email.toLowerCase(),
        passwordHash: await bcrypt.hash(password, 12),
        role,
      },
      select: { id: true, name: true, email: true, role: true },
    });
    res.status(201).json({ user });
  })
);
