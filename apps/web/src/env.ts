import { z } from "zod";

// Segredo só do lado servidor. NEXT_PUBLIC_* é inlinado no bundle em build time:
// é tão público quanto o HTML.
const server = z.object({ API_INTERNAL_URL: z.string().url() });
const client = z.object({ NEXT_PUBLIC_APP_ENV: z.enum(["dev", "staging", "prod"]) });

// Objeto literal obrigatório, uma chave por linha: o bundler substitui
// `process.env.NEXT_PUBLIC_X` literalmente — acesso dinâmico vira undefined.
const clientRaw = { NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV };

const isServer = typeof window === "undefined";
const parsed = isServer
  ? server.merge(client).safeParse({ ...process.env, ...clientRaw })
  : client.safeParse(clientRaw);

if (!parsed.success) {
  throw new Error(`[env] ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
}

export const env = parsed.data as z.infer<typeof server> & z.infer<typeof client>;
