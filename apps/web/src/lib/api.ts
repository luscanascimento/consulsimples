import "server-only";
import { env } from "@/env";
import { ApiError } from "./errors";
import { getSession, setSession, clearSession, type Session } from "./session";

type Options = RequestInit & { auth?: boolean };

async function call<T>(path: string, init: Options, token?: string): Promise<T> {
  // `new Headers()` normaliza as três formas de HeadersInit; espalhar com `...`
  // devolveria {} e sumiria com os headers do chamador em silêncio.
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  const res = await fetch(`${env.API_INTERNAL_URL}${path}`, {
    ...init,
    headers,
    // Dado de tenant/usuário: nunca cachear. Cache compartilhado vaza entre tenants.
    cache: "no-store",
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error?.code ?? "COMMON_500", res.status, body?.error?.details);
  }
  return body as T;
}

/** Chamada sem sessão: signup, login, verificação de email. */
export function apiPublic<T>(path: string, init: RequestInit = {}): Promise<T> {
  return call<T>(path, init);
}

/**
 * Chamada autenticada. Access token expirado (401) dispara uma tentativa de refresh
 * e repete a chamada uma única vez — sem laço, senão um refresh inválido gira para sempre.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await getSession();
  if (!session) throw new ApiError("AUTH_001", 401);

  try {
    return await call<T>(path, init, session.accessToken);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;

    let renewed: Session;
    try {
      renewed = await call<Session>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    } catch {
      await clearSession();
      throw new ApiError("AUTH_003", 401);
    }

    await setSession(renewed);
    return call<T>(path, init, renewed.accessToken);
  }
}
