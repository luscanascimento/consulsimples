import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

type ThrottledRequest = {
  ip?: string;
  user?: { sub?: string };
  body?: { email?: unknown };
};

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: ThrottledRequest): Promise<string> {
    // req.ip só é confiável porque `trust proxy` está configurado com TRUST_PROXY_HOPS.
    // NÃO ler req.headers['x-forwarded-for']: é o valor cru, forjável pelo cliente.
    const ip = req.ip ?? "unknown";
    // Misturar identidade em rota de credencial: impede varrer contas de um IP
    // e impede distribuir ataque a uma conta a partir de muitos IPs.
    const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : undefined;
    const subject = req.user?.sub ?? email;
    return subject ? `${ip}:${subject}` : ip;
  }
}
