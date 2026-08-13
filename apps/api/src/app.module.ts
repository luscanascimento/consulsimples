import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { env } from "@/config/env";
import { AllExceptionsFilter } from "@/common/all-exceptions.filter";
import { CorrelationMiddleware } from "@/common/correlation.middleware";
import { HealthController } from "@/health/health.controller";
import { PrismaModule } from "@/prisma/prisma.module";
import { AuthModule } from "@/auth/auth.module";
import { JwtAuthGuard } from "@/auth/jwt-auth.guard";
import { RolesGuard } from "@/auth/roles.guard";
import { AppThrottlerGuard } from "@/auth/tenant.throttler.guard";
import { CatalogModule } from "@/catalog/catalog.module";
import { UsersModule } from "@/users/users.module";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        base: { service: env.SERVICE_NAME, version: env.APP_VERSION },
        customProps: (req) => ({ correlationId: req.headers["x-correlation-id"] }),
        // Nunca logar credencial nem cookie.
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.body.password",
            "req.body.token",
          ],
          remove: true,
        },
      },
    }),
    ThrottlerModule.forRoot({ throttlers: [{ name: "default", ttl: 60_000, limit: 100 }] }),
    PrismaModule,
    AuthModule,
    CatalogModule,
    UsersModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // O throttler vem antes dos guards de auth: bloquear força bruta não deve custar
    // uma verificação de token.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    // A ordem importa: autenticação primeiro, senão o RolesGuard roda sem req.user.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes("*");
  }
}
