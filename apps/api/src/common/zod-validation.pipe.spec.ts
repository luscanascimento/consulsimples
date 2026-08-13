import { z } from "zod";
import { AppError } from "./app-error";
import { ZodValidationPipe } from "./zod-validation.pipe";

const schema = z.object({ name: z.string().min(1) }).strict();

describe("ZodValidationPipe", () => {
  it("returns parsed data when valid", () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ name: "Bar do Zé" })).toEqual({ name: "Bar do Zé" });
  });

  it("throws VALIDATION_001 with status 422 when invalid", () => {
    const pipe = new ZodValidationPipe(schema);
    // `fail()` não existe no jest-circus: assertions(3) garante que o catch rodou por inteiro.
    expect.assertions(3);
    try {
      pipe.transform({ name: "" });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("VALIDATION_001");
      expect((e as AppError).status).toBe(422);
    }
  });

  it("rejects unknown keys because the schema is strict", () => {
    const pipe = new ZodValidationPipe(schema);
    expect(() => pipe.transform({ name: "ok", role: "OWNER" })).toThrow(AppError);
  });
});
