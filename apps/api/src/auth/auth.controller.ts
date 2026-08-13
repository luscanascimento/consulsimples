import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import {
  signupSchema,
  verifyEmailSchema,
  type SignupInput,
  type VerifyEmailInput,
} from "@consusimples/validation";
import { Public } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/zod-validation.pipe";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
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
}
