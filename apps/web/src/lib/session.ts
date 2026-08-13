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
  const jar = await cookies();
  jar.set(ACCESS, tokens.accessToken, { ...base, maxAge: 15 * 60 });
  jar.set(REFRESH, tokens.refreshToken, { ...base, maxAge: 30 * 24 * 60 * 60 });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS);
  jar.delete(REFRESH);
}
