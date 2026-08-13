// Token de injeção: há duas implementações reais (Resend em produção, fake nos testes),
// que é exatamente o caso em que a indireção se paga.
export const MAILER = Symbol("MAILER");

export interface Mailer {
  sendEmailVerification(to: string, link: string): Promise<void>;
  sendPasswordReset(to: string, link: string): Promise<void>;
}
