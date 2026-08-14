"use server";
import { revalidatePath } from "next/cache";
import { createUserSchema, updateUserSchema } from "@consusimples/validation";
import { apiFetch } from "@/lib/api";
import { messageFor } from "@/lib/errors";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean };

const issuesToFields = (issues: { path: (string | number)[]; message: string }[]) => {
  const fieldErrors: Record<string, string> = {};
  for (const i of issues) fieldErrors[String(i.path[0])] ??= i.message;
  return fieldErrors;
};

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { fieldErrors: issuesToFields(parsed.error.issues) };

  try {
    await apiFetch("/users", { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function updateUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Usuário não encontrado." };

  const parsed = updateUserSchema.safeParse({
    name: formData.get("name"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { fieldErrors: issuesToFields(parsed.error.issues) };

  try {
    await apiFetch(`/users/${id}`, { method: "PATCH", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function disableUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Usuário não encontrado." };

  try {
    await apiFetch(`/users/${id}`, { method: "DELETE" });
  } catch (e) {
    // O erro do último dono (USER_002) precisa chegar na tela, não sumir.
    return { error: messageFor(e) };
  }
  revalidatePath("/usuarios");
  return { ok: true };
}
