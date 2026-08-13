"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiFetch } from "@/lib/api";
import { messageFor } from "@/lib/errors";

// Schema local: este endpoint é do próprio Next, não tem par no pacote compartilhado.
const schema = z.object({
  name: z.string().min(2).max(120).trim(),
  timezone: z.string().min(3).max(64),
});

export type FormState = { error?: string; fieldErrors?: Record<string, string> };

const MESSAGES: Record<string, string> = {
  name: "Informe um nome com pelo menos 2 caracteres.",
  timezone: "Informe um fuso horário, por exemplo America/Sao_Paulo.",
};

export async function completeOnboardingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    // O erro precisa cair no campo que falhou: o aria-describedby liga a mensagem
    // àquele input, e apontar para o campo errado é pior que não apontar.
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      fieldErrors[field] ??= MESSAGES[field] ?? issue.message;
    }
    return { fieldErrors };
  }

  try {
    await apiFetch("/tenant", { method: "PATCH", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }

  revalidatePath("/cardapio");
  redirect("/cardapio");
}
