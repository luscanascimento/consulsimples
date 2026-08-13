import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { LoginInput, SignupInput } from "@consusimples/validation";
import { AppError } from "@/common/app-error";
import { env } from "@/config/env";
import { MAILER, type Mailer } from "@/mail/mailer.port";
import { AuthRepository } from "./auth.repository";
import { PasswordService } from "./password.service";
import { TokenService, type AuthUser } from "./token.service";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const maskEmail = (e: string) => e.replace(/(.).*(@.*)/, "$1***$2");

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repo: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async signup(input: SignupInput): Promise<{ tenantId: string }> {
    const existing = await this.repo.findUserByEmailUnscoped(input.email);
    if (existing) throw new AppError("AUTH_004", "Não foi possível concluir o cadastro", 409);

    const passwordHash = await this.passwords.hash(input.password);
    const rawToken = randomBytes(32).toString("base64url");

    const { tenant, user } = await this.repo.createTenantWithOwner({
      restaurantName: input.restaurantName,
      ownerName: input.ownerName,
      email: input.email,
      passwordHash,
      verificationTokenHash: createHash("sha256").update(rawToken).digest("hex"),
      verificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    });

    await this.mailer.sendEmailVerification(
      user.email,
      `${env.WEB_BASE_URL}/verificar-email?token=${rawToken}`,
    );

    this.logger.log(
      { event: "signup", tenantId: tenant.id, userId: user.id, email: maskEmail(user.email) },
      "tenant created",
    );
    return { tenantId: tenant.id };
  }

  async verifyEmail(token: string): Promise<{ ok: true }> {
    const user = await this.repo.consumeVerificationToken(token);
    if (!user) throw new AppError("AUTH_005", "Link inválido ou expirado", 400);
    this.logger.log(
      { event: "email_verified", userId: user.id, tenantId: user.tenantId },
      "email verified",
    );
    return { ok: true };
  }

  async login(input: LoginInput, ip: string) {
    const user = await this.repo.findUserByEmailUnscoped(input.email);

    // Email inexistente gasta tempo comparável: sem isso o tempo de resposta enumera contas.
    const hash = user?.passwordHash ?? this.passwords.DUMMY_HASH;
    const ok = await this.passwords.verify(hash, input.password);

    if (!user || !ok || user.status === "DISABLED") {
      this.logger.warn({ event: "login_failed", email: maskEmail(input.email), ip }, "login failed");
      // Mesma mensagem e mesmo código para senha errada, email inexistente e usuário desativado.
      throw new AppError("AUTH_001", "Email ou senha inválidos", 401);
    }

    if (user.tenant.status !== "ACTIVE") {
      throw new AppError("AUTH_006", "Confirme seu email para acessar", 403);
    }

    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.repo.updatePasswordHash(user.id, await this.passwords.hash(input.password));
    }

    const claims: AuthUser = { sub: user.id, tenantId: user.tenantId, role: user.role };
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.issueAccessToken(claims),
      this.tokens.issueRefreshToken(user.id),
    ]);
    await this.repo.markLogin(user.id);

    this.logger.log({ event: "login", userId: user.id, tenantId: user.tenantId, ip }, "login succeeded");

    // Nunca devolver o row do Prisma cru: vaza passwordHash.
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId },
    };
  }

  async refresh(rawToken: string) {
    const { userId, refreshToken } = await this.tokens.rotateRefreshToken(rawToken);
    const user = await this.repo.findUserByIdUnscoped(userId);
    if (!user || user.status === "DISABLED" || user.tenant.status !== "ACTIVE") {
      await this.tokens.revokeFamilyByUser(userId);
      throw new AppError("AUTH_001", "Sessão inválida", 401);
    }
    const accessToken = await this.tokens.issueAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    return { accessToken, refreshToken };
  }

  async logout(userId: string) {
    await this.tokens.revokeFamilyByUser(userId);
  }

  async forgotPassword(email: string): Promise<{ ok: true }> {
    const user = await this.repo.findUserByEmailUnscoped(email);

    // Resposta idêntica exista ou não a conta: qualquer diferença — corpo, status
    // ou tempo perceptível — vira oráculo de enumeração de email.
    if (user && user.status === "ACTIVE") {
      const rawToken = randomBytes(32).toString("base64url");
      await this.repo.createPasswordResetToken(
        user.id,
        createHash("sha256").update(rawToken).digest("hex"),
        new Date(Date.now() + RESET_TTL_MS),
      );
      await this.mailer.sendPasswordReset(
        user.email,
        `${env.WEB_BASE_URL}/redefinir-senha?token=${rawToken}`,
      );
      this.logger.log(
        { event: "password_reset_requested", userId: user.id, tenantId: user.tenantId },
        "password reset requested",
      );
    } else {
      this.logger.warn(
        { event: "password_reset_unknown_email", email: maskEmail(email) },
        "password reset for unknown email",
      );
    }

    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
    const passwordHash = await this.passwords.hash(newPassword);
    const userId = await this.repo.consumePasswordResetToken(token, passwordHash);
    if (!userId) throw new AppError("AUTH_005", "Link inválido ou expirado", 400);

    // Troca de senha derruba toda sessão aberta: é a única forma de expulsar
    // quem já estava dentro com a senha antiga.
    await this.tokens.revokeFamilyByUser(userId);
    this.logger.log({ event: "password_reset", userId }, "password reset");
    return { ok: true };
  }
}
