import { Controller, Get } from "@nestjs/common";
import { env } from "@/config/env";
import { Public } from "@/common/decorators";

@Controller("health")
export class HealthController {
  @Public()
  @Get("live")
  live() {
    return { status: "ok", version: env.APP_VERSION };
  }
}
