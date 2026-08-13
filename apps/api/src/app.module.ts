import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { env } from "@/config/env";
import { AllExceptionsFilter } from "@/common/all-exceptions.filter";
import { CorrelationMiddleware } from "@/common/correlation.middleware";
import { HealthController } from "@/health/health.controller";
import { PrismaModule } from "@/prisma/prisma.module";

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
    PrismaModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes("*");
  }
}
