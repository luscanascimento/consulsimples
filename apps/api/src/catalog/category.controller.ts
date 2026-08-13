import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "@consusimples/validation";
import { CurrentUser, Roles } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/zod-validation.pipe";
import type { AuthUser } from "@/auth/token.service";
import { CategoryService } from "./category.service";

@Controller("categories")
export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  // Leitura: qualquer papel autenticado. O escopo do tenant vem do token, não do cliente.
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list({ tenantId: user.tenantId });
  }

  @Roles("OWNER", "MANAGER")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryInput,
  ) {
    return this.service.create({ tenantId: user.tenantId }, dto);
  }

  @Roles("OWNER", "MANAGER")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) dto: UpdateCategoryInput,
  ) {
    return this.service.update({ tenantId: user.tenantId }, id, dto);
  }

  @Roles("OWNER", "MANAGER")
  @HttpCode(204)
  @Delete(":id")
  async remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.service.deactivate({ tenantId: user.tenantId }, id);
  }
}
