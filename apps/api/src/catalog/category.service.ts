import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateCategoryInput, UpdateCategoryInput } from "@consusimples/validation";
import { AppError } from "@/common/app-error";
import type { Scope } from "@/common/scope";
import { CategoryRepository } from "./category.repository";

@Injectable()
export class CategoryService {
  constructor(private readonly repo: CategoryRepository) {}

  list(scope: Scope) {
    return this.repo.list(scope);
  }

  async create(scope: Scope, input: CreateCategoryInput) {
    try {
      return await this.repo.create(scope, { name: input.name, sortOrder: input.sortOrder });
    } catch (e) {
      // P2002 = unique (tenantId, name). Erro de domínio com código próprio,
      // não a mensagem genérica do filtro.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppError("CATALOG_001", "Já existe uma categoria com esse nome", 409);
      }
      throw e;
    }
  }

  async update(scope: Scope, id: string, input: UpdateCategoryInput) {
    const count = await this.repo.update(scope, id, input);
    // 404, não 403: 403 confirmaria que o id existe em outro tenant.
    if (count === 0) throw new AppError("CATALOG_404", "Categoria não encontrada", 404);
    const updated = await this.repo.findById(scope, id);
    if (!updated) throw new AppError("CATALOG_404", "Categoria não encontrada", 404);
    return updated;
  }

  async deactivate(scope: Scope, id: string) {
    const count = await this.repo.deactivate(scope, id);
    if (count === 0) throw new AppError("CATALOG_404", "Categoria não encontrada", 404);
  }
}
