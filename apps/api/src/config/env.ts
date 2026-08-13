import { z } from "zod";

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  // .min(32) pega truncamento silencioso do painel de deploy
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CORS_ORIGINS: z
    .string()
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1)),
  // VPS do cliente: um proxy (Caddy/Traefik) na frente. Confirmar por medição antes do deploy.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  APP_VERSION: z.string().default("dev"),
  SERVICE_NAME: z.string().default("api"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  RESEND_API_KEY: z.string().min(1),
  MAIL_FROM: z.string().min(1),
  WEB_BASE_URL: z.string().url(),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Só o NOME e o motivo. Nunca o valor — vaza segredo no log de boot.
  for (const i of parsed.error.issues) console.error(`[env] ${i.path.join(".")}: ${i.message}`);
  process.exit(1);
}
export const env: Env = parsed.data;
