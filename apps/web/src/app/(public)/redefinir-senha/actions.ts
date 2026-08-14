"use server";
import { redirect } from "next/navigation";
import { resetPasswordSchema } from "@consusimples/validation";
import { apiPublic } from "@/lib/api";
import { messageFor } from "@/lib/errors";

export type FormState = {
  error?: string | undefined;
  fieldErrors?: Record<string, string> | undefined;
};

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] ??=
        issue.path[0] === "password"
          ? "A senha precisa ter pelo menos 12 caracteres."
          : "Link inválido ou expirado. Peça um novo.";
    }
    return { fieldErrors };
  }

  try {
    await apiPublic("/auth/reset-password", { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }

  // redirect() lança: fora do try, senão o catch engole o controle de fluxo.
  redirect("/entrar?senha-redefinida=1");
}
