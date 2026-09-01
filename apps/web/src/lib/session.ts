import "server-only";
import { cookies } from "next/headers";

// __Host- amarra o cookie ao host exato: exige Secure e path=/, e proíbe Domain.
// Subdomínio comprometido não consegue sobrescrever.
const ACCESS = "__Host-at";
const REFRESH = "__Host-rt";

export type Session = { accessToken: string; refreshToken: string };

const base = {
  httpOnly: true, // JS não lê: XSS não rouba a sessão
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const accessToken = jar.get(ACCESS)?.value;
  const refreshToken = jar.get(REFRESH)?.value;
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function setSession(tokens: Session): Promise<void> {
  try {
    const jar = await cookies();
    jar.set(ACCESS, tokens.accessToken, { ...base, maxAge: 15 * 60 });
    jar.set(REFRESH, tokens.refreshToken, { ...base, maxAge: 30 * 24 * 60 * 60 });
  } catch {
    // No Next.js 15, cookies().set lança durante a fase de render de Server Components.
    // O try-catch permite que a requisição corrente continue com o novo accessToken.
  }
}

export async function clearSession(): Promise<void> {
  try {
    const jar = await cookies();
    // `jar.delete(nome)` emite um Set-Cookie sem Secure, e o navegador RECUSA qualquer
    // Set-Cookie com prefixo __Host- que não traga Secure e Path=/ — o cookie sobreviveria
    // ao logout. Sobrescrever com os mesmos atributos e maxAge 0 é o que apaga de verdade.
    jar.set(ACCESS, "", { ...base, maxAge: 0 });
    jar.set(REFRESH, "", { ...base, maxAge: 0 });
  } catch {
    // Silencia se chamado em contexto somente leitura de cookies
  }
}
