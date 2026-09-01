import { Body, Controller, Get, Patch } from "@nestjs/common";
import { updateTenantSchema, type UpdateTenantInput } from "@consusimples/validation";
import { CurrentUser, Roles } from "@/common/decorators";
import { defined } from "@/common/defined";
import { ZodValidationPipe } from "@/common/zod-validation.pipe";
import type { AuthUser } from "@/auth/token.service";
import { PrismaService } from "@/prisma/prisma.service";

@Roles("OWNER", "MANAGER")
@Controller("tenant")
export class TenantController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    // O id vem do token, garantindo escopo estrito por tenant.
    return this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, name: true, slug: true, timezone: true, status: true },
    });
  }

  @Patch()
  async update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateTenantSchema)) dto: UpdateTenantInput,
  ) {
    // O id vem do token, nunca do payload: não existe caminho para editar outro tenant.
    const tenant = await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: defined(dto),
      select: { id: true, name: true, timezone: true },
    });
    return tenant;
  }
}

