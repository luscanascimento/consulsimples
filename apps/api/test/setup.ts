import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export function migrateTestDb() {
  // migrate deploy: só aplica o que está versionado. `migrate dev` jamais em CI.
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit" });
}

export async function resetDb() {
  // Ordem: filhos antes dos pais. Cascade tornaria isso desnecessário, mas explícito é auditável.
  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.user.deleteMany(),
    prisma.tenant.deleteMany(),
  ]);
}
