/** Seed: bootstrap the first HQ owner account. Idempotent: skips if it already exists. */
import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcrypt";
import { config } from "../src/config";

const prisma = new PrismaClient();

const DEFAULT_SEED_OWNER_PASSWORD = "hqowner1234!";

async function main() {
  // A production seed running with the literal schema default creates a
  // publicly-known owner credential for the internal ops console — the
  // docs tell an operator to set HQ_SEED_OWNER_PASSWORD, but nothing
  // enforced it. This does.
  if (config.isProd && config.seed.ownerPassword === DEFAULT_SEED_OWNER_PASSWORD) {
    throw new Error(
      "Refusing to seed in production with the default HQ_SEED_OWNER_PASSWORD. " +
        "Set a real value in .env before running db:seed."
    );
  }

  const existing = await prisma.hqStaff.findUnique({ where: { email: config.seed.ownerEmail.toLowerCase() } });
  if (existing) {
    console.log(`Seed skipped: owner ${config.seed.ownerEmail} already exists.`);
    return;
  }

  const owner = await prisma.hqStaff.create({
    data: {
      name: config.seed.ownerName,
      email: config.seed.ownerEmail.toLowerCase(),
      passwordHash: await bcrypt.hash(config.seed.ownerPassword, 12),
      role: "owner",
    },
  });

  console.log("Seed complete:");
  console.log(`  owner: ${owner.email}  (password from HQ_SEED_OWNER_PASSWORD)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
