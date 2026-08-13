"use server";
import { redirect } from "next/navigation";
import { loginSchema } from "@consusimples/validation";
import { apiPublic } from "@/lib/api";
import { messageFor } from "@/lib/errors";
import { setSession } from "@/lib/session";

export type FormState = { error?: string };

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; role: string; tenantId: string };
};

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  // Mensagem única: dizer "email inválido" já diferencia os casos para quem sonda.
  if (!parsed.success) return { error: "Email ou senha inválidos." };

  let session: LoginResponse;
  try {
    session = await apiPublic<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
  } catch (e) {
    return { error: messageFor(e) };
  }

  await setSession({ accessToken: session.accessToken, refreshToken: session.refreshToken });
  // redirect() lança: fora do try, senão o catch engoliria o controle de fluxo.
  redirect("/cardapio");
}
