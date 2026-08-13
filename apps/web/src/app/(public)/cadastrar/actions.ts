"use server";
import { redirect } from "next/navigation";
import { signupSchema } from "@consusimples/validation";
import { apiPublic } from "@/lib/api";
import { messageFor } from "@/lib/errors";

export type FormState = { error?: string; fieldErrors?: Record<string, string> };

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Toda Server Action é um endpoint HTTP público: valida aqui, não confia na UI.
  const parsed = signupSchema.safeParse({
    restaurantName: formData.get("restaurantName"),
    ownerName: formData.get("ownerName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }

  try {
    await apiPublic("/auth/signup", { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }

  // redirect() lança: precisa ficar FORA do try, senão o catch engole o controle de fluxo.
  redirect("/confirme-seu-email");
}
