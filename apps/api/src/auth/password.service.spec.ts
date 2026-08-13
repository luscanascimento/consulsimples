import { AppError } from "@/common/app-error";
import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes and verifies a password", async () => {
    const hash = await service.hash("senha-bem-comprida-123");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await service.verify(hash, "senha-bem-comprida-123")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await service.hash("senha-bem-comprida-123");
    expect(await service.verify(hash, "senha-errada-comprida")).toBe(false);
  });

  it("never produces the same hash twice for the same password", async () => {
    const a = await service.hash("senha-bem-comprida-123");
    const b = await service.hash("senha-bem-comprida-123");
    expect(a).not.toBe(b); // salt aleatório embutido no encoding
  });

  it("refuses to hash a password larger than 1 KiB", async () => {
    await expect(service.hash("a".repeat(1025))).rejects.toBeInstanceOf(AppError);
  });

  it("returns false instead of burning CPU when verifying an oversized password", async () => {
    const hash = await service.hash("senha-bem-comprida-123");
    expect(await service.verify(hash, "a".repeat(1025))).toBe(false);
  });

  it("exposes a dummy hash that verifies against nothing", async () => {
    expect(await service.verify(service.DUMMY_HASH, "qualquer-coisa")).toBe(false);
  });
});
