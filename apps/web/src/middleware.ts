import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  // DENTRO do handler: em escopo de módulo o nonce seria gerado uma vez por processo
  // e serviria todas as respostas — um XSS leria o nonce e a CSP viraria decoração.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce); // `set`, nunca `append`: sobrescreve o que o cliente mandou
  // O Next só carimba o nonce nas próprias tags <script> quando lê a policy do header
  // da REQUISIÇÃO. Sem isto o relatório acusaria violação em script nosso e a promoção
  // para modo enforce quebraria a página inteira.
  headers.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers } });
  // Subir primeiro como Report-Only, coletar violações, depois promover para
  // Content-Security-Policy. Trocar o nome do header quando o relatório vier limpo.
  res.headers.set("Content-Security-Policy-Report-Only", csp);
  return res;
}

// Só HTML: sem o matcher, cada asset estático paga o middleware à toa.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
