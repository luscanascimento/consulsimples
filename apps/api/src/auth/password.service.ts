import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { AppError } from "@/common/app-error";

// Referência OWASP para argon2id. Subir memoryCost até o custo por hash caber
// no orçamento de latência do hardware alvo — medir na VPS antes de fixar.
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

// argon2 não trunca como bcrypt: sem teto, uma "senha" de 1 MB é CPU e RAM de graça
// para o atacante. O teto vale nos dois lados — hash e verify.
const MAX_PASSWORD_BYTES = 1024;
const tooLong = (plain: string) => Buffer.byteLength(plain) > MAX_PASSWORD_BYTES;

@Injectable()
export class PasswordService {
  // Hash de uma senha aleatória descartada. Serve para o login gastar tempo
  // comparável quando o email não existe — sem isso o tempo de resposta enumera contas.
  readonly DUMMY_HASH =
    "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Xf9nBLZ8Yk3Q0m2vP1sT7uWx4yZ6aB8cD0eF2gH4iJk";

  async hash(plain: string): Promise<string> {
    if (tooLong(plain)) throw new AppError("AUTH_002", "Senha muito longa", 400);
    return argon2.hash(plain, OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    if (tooLong(plain)) return false;
    try {
      // salt e parâmetros vêm dentro do hash
      return await argon2.verify(hash, plain);
    } catch {
      // hash malformado (o DUMMY_HASH inclusive) não é exceção de negócio
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, OPTIONS);
  }
}
