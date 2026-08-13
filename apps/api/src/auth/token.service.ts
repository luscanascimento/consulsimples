import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { UserRole } from "@prisma/client";
import { AppError } from "@/common/app-error";
import { env } from "@/config/env";
import { PrismaService } from "@/prisma/prisma.service";

export type AuthUser = { sub: string; tenantId: string; role: UserRole };

const ACCESS_TTL = "15m";
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// sha256 sem salt: precisa ser determinístico para o WHERE token_hash = $1.
// O que impede pré-computação é a entropia dos 32 bytes de CSPRNG, não o hash.
const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async issueAccessToken(payload: AuthUser): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: env.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TTL,
    });
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    try {
      const claims = await this.jwt.verifyAsync<AuthUser>(token, {
        secret: env.JWT_ACCESS_SECRET,
      });
      return { sub: claims.sub, tenantId: claims.tenantId, role: claims.role };
    } catch {
      throw new AppError("AUTH_001", "Sessão inválida", 401);
    }
  }

  async issueRefreshToken(userId: string, familyId?: string): Promise<string> {
    const raw = randomBytes(32).toString("base64url");
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId: familyId ?? randomUUID(),
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return raw;
  }

  async rotateRefreshToken(raw: string): Promise<{ userId: string; refreshToken: string }> {
    const tokenHash = hashToken(raw);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const current = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!current) throw new AppError("AUTH_001", "Sessão inválida", 401);

      // Reuso: o token já rotacionado voltou. Ele vazou — a linhagem inteira morre.
      // A revogação NÃO acontece aqui dentro: lançar dentro do $transaction faz rollback
      // e desfaria exatamente o UPDATE que protege o usuário. Devolve o veredito e
      // quem revoga é o bloco de depois do commit.
      if (current.revokedAt) return { reused: true as const, familyId: current.familyId };

      if (current.expiresAt <= new Date()) {
        throw new AppError("AUTH_001", "Sessão inválida", 401);
      }

      // updateMany com revokedAt: null é o lock otimista — duas rotações
      // simultâneas com o mesmo token: só uma afeta linha, a outra vê 0.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) throw new AppError("AUTH_001", "Sessão inválida", 401);

      return { reused: false as const, userId: current.userId, familyId: current.familyId };
    });

    if (outcome.reused) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: outcome.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new AppError("AUTH_003", "Sessão revogada", 401);
    }

    const { userId, familyId } = outcome;

    const refreshToken = await this.issueRefreshToken(userId, familyId);
    const created = await this.prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(refreshToken) },
    });
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, replacedBy: null },
      data: { replacedBy: created.id },
    });

    return { userId, refreshToken };
  }

  async revokeFamilyByUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
