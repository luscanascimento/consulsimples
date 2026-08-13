import { Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";
import { AppError } from "./app-error";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const r = this.schema.safeParse(value);
    // Um código e um status para falha de validação em TODO o repositório.
    if (!r.success) {
      throw new AppError("VALIDATION_001", "Payload inválido", 422, { issues: r.error.issues });
    }
    return r.data;
  }
}
