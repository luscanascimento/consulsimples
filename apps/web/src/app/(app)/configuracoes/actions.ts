"use server";
import { revalidatePath } from "next/cache";
import { updateTenantSchema } from "@consusimples/validation";
import { apiFetch } from "@/lib/api";
import { messageFor } from "@/lib/errors";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean };

const MESSAGES: Record<string, string> = {
  name: "Informe um nome com pelo menos 2 caracteres.",
  timezone: "Informe um fuso horário válido, como America/Sao_Paulo.",
};

export async function updateRestaurantAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = updateTenantSchema.safeParse({
    name: formData.get("name") || undefined,
    timezone: formData.get("timezone") || undefined,
  });

  if (!parsed.success) {
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

  revalidatePath("/configuracoes");
  revalidatePath("/cardapio");
  return { ok: true };
}
