import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";
import { env } from "@/config/env";
import type { Mailer } from "./mailer.port";

@Injectable()
export class ResendMailer implements Mailer {
  private readonly logger = new Logger(ResendMailer.name);
  private readonly client = new Resend(env.RESEND_API_KEY);

  async sendEmailVerification(to: string, link: string): Promise<void> {
    const { error } = await this.client.emails.send({
      from: env.MAIL_FROM,
      to,
      subject: "Confirme seu email — consusimples",
      html: `<p>Confirme seu cadastro para começar a usar o consusimples.</p>
             <p><a href="${link}">Confirmar email</a></p>
             <p>O link vale por 24 horas.</p>`,
    });
    // Email mascarado: endereço completo em log é dado pessoal replicado.
    if (error) {
      this.logger.error({ to: to.replace(/(.).*(@.*)/, "$1***$2") }, "verification email failed");
      throw error;
    }
  }

  async sendPasswordReset(to: string, link: string): Promise<void> {
    const { error } = await this.client.emails.send({
      from: env.MAIL_FROM,
      to,
      subject: "Redefinir senha — consusimples",
      html: `<p>Alguém pediu para redefinir a senha desta conta.</p>
             <p><a href="${link}">Criar uma nova senha</a></p>
             <p>O link vale por 1 hora. Se não foi você, ignore este email.</p>`,
    });
    if (error) {
      this.logger.error({ to: to.replace(/(.).*(@.*)/, "$1***$2") }, "password reset email failed");
      throw error;
    }
  }
}
