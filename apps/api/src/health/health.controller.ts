import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { env } from "@/config/env";
import { Public } from "@/common/decorators";
import { PrismaService } from "@/prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get("live")
  live() {
    return { status: "ok", version: env.APP_VERSION };
  }

  @Public()
  @Get("ready")
  async ready() {
    try {
      // Readiness confere a dependência que impede servir tráfego: o banco.
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException("database unavailable");
    }
  }
}
