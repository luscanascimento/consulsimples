import { ApiError, messageFor } from "./errors";

describe("messageFor", () => {
  it("translates known API codes to pt-BR", () => {
    expect(messageFor(new ApiError("AUTH_001", 401))).toBe("Email ou senha inválidos.");
    expect(messageFor(new ApiError("AUTH_004", 409))).toBe(
      "Não foi possível concluir o cadastro. Tente outro email.",
    );
    expect(messageFor(new ApiError("AUTH_006", 403))).toBe(
      "Confirme seu email antes de entrar. Verifique sua caixa de entrada.",
    );
    expect(messageFor(new ApiError("VALIDATION_001", 422))).toBe(
      "Confira os campos destacados.",
    );
    expect(messageFor(new ApiError("CATALOG_001", 409))).toBe(
      "Já existe uma categoria com esse nome.",
    );
    expect(messageFor(new ApiError("USER_002", 409))).toBe(
      "O restaurante precisa de pelo menos um dono ativo.",
    );
  });

  it("maps 429 to a rate limit message regardless of code", () => {
    expect(messageFor(new ApiError("COMMON_429", 429))).toBe(
      "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
    );
  });

  it("falls back to a generic message for an unknown error", () => {
    expect(messageFor(new Error("boom"))).toBe(
      "Algo deu errado. Tente de novo em instantes.",
    );
  });

  it("never leaks the raw error message to the user", () => {
    expect(messageFor(new ApiError("WEIRD_999", 500))).not.toContain("WEIRD_999");
  });
});
