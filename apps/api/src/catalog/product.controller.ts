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
  Query,
} from "@nestjs/common";
import {
  createProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type UpdateProductInput,
} from "@consusimples/validation";
import { CurrentUser, Roles } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/zod-validation.pipe";
import type { AuthUser } from "@/auth/token.service";
import { ProductService } from "./product.service";

@Controller("products")
export class ProductController {
  constructor(private readonly service: ProductService) {}

  // ParseUUIDPipe no filtro também: sem ele o valor cru chega no WHERE e o Postgres
  // derruba a requisição com 500 em vez de 400.
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("categoryId", new ParseUUIDPipe({ optional: true })) categoryId?: string,
  ) {
    return this.service.list({ tenantId: user.tenantId }, categoryId);
  }

  @Get(":id")
  findById(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.findById({ tenantId: user.tenantId }, id);
  }

  @Roles("OWNER", "MANAGER")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProductSchema)) dto: CreateProductInput,
  ) {
    return this.service.create({ tenantId: user.tenantId }, dto);
  }

  @Roles("OWNER", "MANAGER")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) dto: UpdateProductInput,
  ) {
    return this.service.update({ tenantId: user.tenantId }, user.sub, id, dto);
  }

  @Roles("OWNER", "MANAGER")
  @HttpCode(204)
  @Delete(":id")
  async remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.service.remove({ tenantId: user.tenantId }, id);
  }
}
