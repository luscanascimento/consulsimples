import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "@/prisma/prisma.service";

const slugify = (name: string) =>
  name
    .normalize("NFD")
    // Combining diacritics (U+0300–U+036F) em forma escapada: o range literal é invisível
    // no editor e sobrevive mal a copiar/colar.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Busca por email é global de propósito: o email é único em todo o sistema
  // e é o que identifica o usuário antes de existir tenant no contexto.
  findUserByEmailUnscoped(email: string) {
    return this.prisma.user.findUnique({ where: { email }, include: { tenant: true } });
  }

  async createTenantWithOwner(input: {
    restaurantName: string;
    ownerName: string;
    email: string;
    passwordHash: string;
    verificationTokenHash: string;
    verificationExpiresAt: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.restaurantName,
          slug: `${slugify(input.restaurantName)}-${Date.now().toString(36)}`,
        },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: input.email,
          name: input.ownerName,
          role: "OWNER",
          passwordHash: input.passwordHash,
        },
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: input.verificationTokenHash,
          expiresAt: input.verificationExpiresAt,
        },
      });
      return { tenant, user };
    });
  }

  async consumeVerificationToken(rawToken: string) {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!row || row.usedAt || row.expiresAt <= new Date()) return null;

      // updateMany com usedAt: null — dois cliques simultâneos, só um consome.
      const { count } = await tx.emailVerificationToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0) return null;

      await tx.tenant.update({ where: { id: row.user.tenantId }, data: { status: "ACTIVE" } });
      return row.user;
    });
  }

  markLogin(userId: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  updatePasswordHash(userId: string, passwordHash: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }
}
