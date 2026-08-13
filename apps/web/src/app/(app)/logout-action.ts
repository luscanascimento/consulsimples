"use server";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearSession } from "@/lib/session";

export async function logoutAction(): Promise<void> {
  // Revogar no servidor antes de limpar o cookie: cookie apagado sem revogação
  // deixa o refresh token válido em qualquer cópia que tenha vazado.
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch {
    // Sessão já inválida do lado da API: seguir e limpar mesmo assim.
  }
  await clearSession();
  redirect("/entrar");
}
