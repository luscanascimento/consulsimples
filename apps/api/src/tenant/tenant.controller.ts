import { Body, Controller, Patch } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, Roles } from "@/common/decorators";
import { defined } from "@/common/defined";
import { ZodValidationPipe } from "@/common/zod-validation.pipe";
import type { AuthUser } from "@/auth/token.service";
import { PrismaService } from "@/prisma/prisma.service";

const updateTenantSchema = z
  .object({ name: z.string().min(2).max(120).trim(), timezone: z.string().min(3).max(64) })
  .partial()
  .strict();

@Roles("OWNER", "MANAGER")
@Controller("tenant")
export class TenantController {
  constructor(private readonly prisma: PrismaService) {}

  @Patch()
  async update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateTenantSchema)) dto: { name?: string; timezone?: string },
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
