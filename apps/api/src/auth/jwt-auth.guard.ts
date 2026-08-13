import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppError } from "@/common/app-error";
import { IS_PUBLIC } from "@/common/decorators";
import { TokenService, type AuthUser } from "./token.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // getAllAndOverride: o handler pode marcar público um método de controller privado.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthUser;
    }>();
    const [scheme, token] = String(req.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token) throw new AppError("AUTH_001", "Sessão inválida", 401);

    // Erro de verificação sobe como 401. Nunca `catch {}` seguindo com req.user indefinido.
    req.user = await this.tokens.verifyAccessToken(token);
    return true;
  }
}
