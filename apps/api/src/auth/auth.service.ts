import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { SignupInput } from "@consusimples/validation";
import { AppError } from "@/common/app-error";
import { env } from "@/config/env";
import { MAILER, type Mailer } from "@/mail/mailer.port";
import { AuthRepository } from "./auth.repository";
import { PasswordService } from "./password.service";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const maskEmail = (e: string) => e.replace(/(.).*(@.*)/, "$1***$2");

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repo: AuthRepository,
    private readonly passwords: PasswordService,
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
}
