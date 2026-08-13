import { Module } from "@nestjs/common";
import { MAILER } from "./mailer.port";
import { ResendMailer } from "./resend.mailer";

@Module({
  providers: [{ provide: MAILER, useClass: ResendMailer }],
  exports: [MAILER],
})
export class MailModule {}
