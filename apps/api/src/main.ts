import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.use(
    helmet({
      // API JSON não renderiza HTML: CSP mínima. A CSP de verdade mora no Next.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          "default-src": ["'none'"],
          "frame-ancestors": ["'none'"],
          "base-uri": ["'none'"],
          "form-action": ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
      hsts: env.NODE_ENV === "production" ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  app.enableCors({
    // Tipagem explícita: a união de CorsOptions["origin"] impede a inferência do callback.
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true); // same-origin, curl, health: não é CORS
      cb(null, env.CORS_ORIGINS.includes(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Correlation-Id"],
    maxAge: 86_400,
  });

  app.use(express.json({ limit: "1mb" })); // body ilimitado é DoS grátis
  // Número, nunca `true`: `true` aceita a entrada do XFF que o cliente controla.
  app.getHttpAdapter().getInstance().set("trust proxy", env.TRUST_PROXY_HOPS);

  await app.listen(env.PORT);
}
void bootstrap();
