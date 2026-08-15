import { PrismaClient } from "../generated/prisma";

// Hot-reload (tsx watch) re-executes this module on every file change; without
// a globalThis-cached singleton each reload would open a fresh pool of DB
// connections on top of the last one until Postgres runs out.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
