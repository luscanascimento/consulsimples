import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MailModule } from "@/mail/mail.module";
import { AuthController } from "./auth.controller";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

@Global()
@Module({
  imports: [JwtModule.register({}), MailModule],
  controllers: [AuthController],
  providers: [PasswordService, TokenService, AuthRepository, AuthService],
  exports: [PasswordService, TokenService],
})
export class AuthModule {}
