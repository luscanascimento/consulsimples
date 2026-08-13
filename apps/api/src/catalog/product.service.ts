import { Injectable, Logger } from "@nestjs/common";
import type { CreateProductInput, UpdateProductInput } from "@consusimples/validation";
import { AppError } from "@/common/app-error";
import type { Scope } from "@/common/scope";
import { CategoryRepository } from "./category.repository";
import { ProductRepository } from "./product.repository";

const notFound = () => new AppError("CATALOG_404", "Produto não encontrado", 404);

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly repo: ProductRepository,
    private readonly categories: CategoryRepository,
  ) {}

  list(scope: Scope, categoryId?: string) {
    return this.repo.list(scope, categoryId);
  }

  async findById(scope: Scope, id: string) {
    const product = await this.repo.findById(scope, id);
    if (!product) throw notFound();
    return product;
  }

  async create(scope: Scope, input: CreateProductInput) {
    // Categoria de outro tenant não existe deste lado: 404, não 403.
    const category = await this.categories.findById(scope, input.categoryId);
    if (!category) throw new AppError("CATALOG_404", "Categoria não encontrada", 404);

    return this.repo.create(scope, {
      name: input.name,
      description: input.description,
      categoryId: input.categoryId,
      priceCents: input.priceCents,
      available: input.available,
      sortOrder: input.sortOrder,
    });
  }

  async update(scope: Scope, actorId: string, id: string, input: UpdateProductInput) {
    if (input.categoryId) {
      const category = await this.categories.findById(scope, input.categoryId);
      if (!category) throw new AppError("CATALOG_404", "Categoria não encontrada", 404);
    }

    const before = await this.repo.findById(scope, id);
    if (!before) throw notFound();

    const count = await this.repo.update(scope, id, input);
    if (count === 0) throw notFound();
    const after = await this.findById(scope, id);

    // Preço é dado de auditoria: quem mudou, de quanto para quanto.
    if (input.priceCents !== undefined && input.priceCents !== before.priceCents) {
      this.logger.log(
        {
          event: "product_price_changed",
          actorId,
          tenantId: scope.tenantId,
          productId: id,
          before: before.priceCents,
          after: after.priceCents,
        },
        "product price changed",
      );
    }
    return after;
  }

  async remove(scope: Scope, id: string) {
    const count = await this.repo.delete(scope, id);
    if (count === 0) throw notFound();
  }
}
