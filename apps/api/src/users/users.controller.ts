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
  createUserSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from "@consusimples/validation";
import { CurrentUser, Roles } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/zod-validation.pipe";
import type { AuthUser } from "@/auth/token.service";
import { UsersService } from "./users.service";

// O módulo inteiro é de administração: nenhum papel operacional entra.
@Roles("OWNER", "MANAGER")
@Controller("users")
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list({ tenantId: user.tenantId });
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserInput,
  ) {
    return this.service.create({ tenantId: user.tenantId }, user, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserInput,
  ) {
    return this.service.update({ tenantId: user.tenantId }, user, id, dto);
  }

  @HttpCode(204)
  @Delete(":id")
  async disable(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.service.disable({ tenantId: user.tenantId }, user, id);
  }
}
