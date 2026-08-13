"use server";
import { revalidatePath } from "next/cache";
import {
  createCategorySchema,
  createProductSchema,
  updateProductSchema,
} from "@consusimples/validation";
import { apiFetch } from "@/lib/api";
import { messageFor } from "@/lib/errors";
import { parseCurrencyInput } from "@/lib/money";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean };

const issuesToFields = (issues: { path: (string | number)[]; message: string }[]) => {
  const fieldErrors: Record<string, string> = {};
  for (const i of issues) fieldErrors[String(i.path[0])] ??= i.message;
  return fieldErrors;
};

export async function createCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createCategorySchema.safeParse({
    name: formData.get("name"),
    sortOrder: Number(formData.get("sortOrder") ?? 0),
  });
  if (!parsed.success) return { fieldErrors: issuesToFields(parsed.error.issues) };

  try {
    await apiFetch("/categories", { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }
  revalidatePath("/cardapio");
  return { ok: true };
}

export async function createProductAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // O usuário digita "23,50"; o contrato da API é centavo inteiro.
  const priceCents = parseCurrencyInput(String(formData.get("price") ?? ""));
  if (priceCents === null) {
    return { fieldErrors: { price: "Informe um valor como 23,50." } };
  }

  const parsed = createProductSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    categoryId: formData.get("categoryId"),
    priceCents,
    available: formData.get("available") === "on",
    sortOrder: Number(formData.get("sortOrder") ?? 0),
  });
  if (!parsed.success) return { fieldErrors: issuesToFields(parsed.error.issues) };

  try {
    await apiFetch("/products", { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }
  revalidatePath("/cardapio");
  return { ok: true };
}

export async function updateProductAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Produto não encontrado." };

  const rawPrice = String(formData.get("price") ?? "");
  const priceCents = parseCurrencyInput(rawPrice);
  if (priceCents === null) return { fieldErrors: { price: "Informe um valor como 23,50." } };

  const parsed = updateProductSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    priceCents,
    available: formData.get("available") === "on",
  });
  if (!parsed.success) return { fieldErrors: issuesToFields(parsed.error.issues) };

  try {
    await apiFetch(`/products/${id}`, { method: "PATCH", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }
  revalidatePath("/cardapio");
  return { ok: true };
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Falha aqui é silenciosa de propósito: o revalidate mostra o estado real do servidor.
  try {
    await apiFetch(`/products/${id}`, { method: "DELETE" });
  } catch {
    /* estado real reaparece no reload */
  }
  revalidatePath("/cardapio");
}
