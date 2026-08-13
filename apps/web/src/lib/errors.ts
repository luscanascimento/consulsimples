export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

const MESSAGES: Record<string, string> = {
  AUTH_001: "Email ou senha inválidos.",
  AUTH_003: "Sua sessão expirou. Entre de novo.",
  AUTH_004: "Não foi possível concluir o cadastro. Tente outro email.",
  AUTH_005: "Link inválido ou expirado. Peça um novo.",
  AUTH_006: "Confirme seu email antes de entrar. Verifique sua caixa de entrada.",
  AUTH_403: "Você não tem permissão para isso.",
  VALIDATION_001: "Confira os campos destacados.",
  CATALOG_001: "Já existe uma categoria com esse nome.",
  CATALOG_404: "Esse item não existe mais.",
  USER_001: "Esse email já está cadastrado.",
  USER_002: "O restaurante precisa de pelo menos um dono ativo.",
  USER_404: "Esse usuário não existe mais.",
};

const GENERIC = "Algo deu errado. Tente de novo em instantes.";

export function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC;
  // 429 tem tratamento próprio: a causa é o ritmo, não o payload.
  if (error.status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  // Fallback nunca ecoa o código cru: o usuário não deve ler jargão nosso.
  return MESSAGES[error.code] ?? GENERIC;
}
