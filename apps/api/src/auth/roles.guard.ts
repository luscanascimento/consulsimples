import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@prisma/client";
import { AppError } from "@/common/app-error";
import { ROLES_KEY } from "@/common/decorators";
import type { AuthUser } from "./token.service";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new AppError("AUTH_001", "Sessão inválida", 401);
    if (!required.includes(user.role)) {
      throw new AppError("AUTH_403", "Permissão insuficiente", 403);
    }
    return true;
  }
}
