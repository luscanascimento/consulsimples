import "server-only";
import { redirect } from "next/navigation";
import { apiFetch } from "./api";
import { getSession } from "./session";

export type AuthUser = {
  id: string;
  name: string;
  role: "OWNER" | "MANAGER" | "WAITER" | "KITCHEN" | "CASHIER";
  tenantId: string;
};

/** Exige sessão válida. Quem é o usuário quem diz é a API — o Next não decodifica o token. */
export async function requireSession(): Promise<AuthUser> {
  const session = await getSession();
  if (!session) redirect("/entrar");
  try {
    return await apiFetch<AuthUser>("/auth/me");
  } catch {
    redirect("/entrar");
  }
}
