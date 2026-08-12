/** Seed: bootstrap the first HQ owner account. Idempotent: skips if it already exists. */
import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcrypt";
import { config } from "../src/config";

const prisma = new PrismaClient();

async function main() {
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
