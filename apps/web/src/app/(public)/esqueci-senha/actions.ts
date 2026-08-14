"use server";
import { forgotPasswordSchema } from "@consusimples/validation";
import { apiPublic } from "@/lib/api";
import { messageFor } from "@/lib/errors";

export type FormState = {
  sent?: boolean | undefined;
  error?: string | undefined;
  fieldErrors?: Record<string, string> | undefined;
};

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: { email: "Informe um email válido." } };

  try {
    await apiPublic("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
  } catch (e) {
    return { error: messageFor(e) };
  }

  // Mesma confirmação sempre: a API já responde 202 para email desconhecido, e a tela
  // não pode desfazer isso mostrando "não encontramos essa conta".
  return { sent: true };
}
