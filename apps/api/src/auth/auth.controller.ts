import { Body, Controller, Get, HttpCode, Ip, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RefreshInput,
  type ResetPasswordInput,
  type SignupInput,
  type VerifyEmailInput,
} from "@consusimples/validation";
import { CurrentUser, Public } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/zod-validation.pipe";
import { AuthService } from "./auth.service";
import type { AuthUser } from "./token.service";

// Rotas que MANDAM email para um endereço escolhido pelo cliente contam por IP puro.
// O tracker padrão mistura o email do corpo, e aí trocar de email a cada request zera o
// contador: um IP dispara email ilimitado em nome do produto.
const byIp = (req: { ip?: string }) => req.ip ?? "unknown";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 3_600_000, limit: 3, getTracker: byIp } })
  @Post("signup")
  signup(@Body(new ZodValidationPipe(signupSchema)) dto: SignupInput) {
    return this.auth.signup(dto);
  }

  @Public()
  @HttpCode(200)
  @Post("verify-email")
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) dto: VerifyEmailInput) {
    return this.auth.verifyEmail(dto.token);
  }

  @Public()
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @HttpCode(200)
  @Post("login")
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginInput, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  @Public()
  @Throttle({ default: { ttl: 900_000, limit: 20 } })
  @HttpCode(200)
  @Post("refresh")
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshInput) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Throttle({ default: { ttl: 3_600_000, limit: 3, getTracker: byIp } })
  @HttpCode(202)
  @Post("forgot-password")
  forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordInput) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  @HttpCode(200)
  @Post("reset-password")
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordInput) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  // Quem é o portador do token quem responde é a API: o BFF não decodifica JWT.
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub, user.tenantId);
  }

  @HttpCode(204)
  @Post("logout")
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user.sub);
  }
}
