import { Injectable } from "@nestjs/common";
import { defined } from "@/common/defined";
import type { Scope } from "@/common/scope";
import { PrismaService } from "@/prisma/prisma.service";

const SELECT = {
  id: true,
  name: true,
  description: true,
  categoryId: true,
  priceCents: true,
  available: true,
  sortOrder: true,
} as const;

type CreateData = {
  name: string;
  description?: string | undefined;
  categoryId: string;
  priceCents: number;
  available: boolean;
  sortOrder: number;
};

// `| undefined` explícito em cada chave: o tsconfig usa exactOptionalPropertyTypes e o dto
// parcial do zod carrega as chaves ausentes como undefined.
type UpdateData = { [K in keyof CreateData]?: CreateData[K] | undefined };

@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(scope: Scope, categoryId?: string) {
    return this.prisma.product.findMany({
      where: { tenantId: scope.tenantId, ...(categoryId ? { categoryId } : {}) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 500, // sem take ilimitado
      select: SELECT,
    });
  }

  findById(scope: Scope, id: string) {
    return this.prisma.product.findFirst({
      where: { id, tenantId: scope.tenantId },
      select: SELECT,
    });
  }

  create(scope: Scope, data: CreateData) {
    return this.prisma.product.create({
      data: { ...defined(data), tenantId: scope.tenantId },
      select: SELECT,
    });
  }

  async update(scope: Scope, id: string, data: UpdateData) {
    const { count } = await this.prisma.product.updateMany({
      where: { id, tenantId: scope.tenantId },
      data: defined(data),
    });
    return count;
  }

  async delete(scope: Scope, id: string) {
    const { count } = await this.prisma.product.updateMany({
      where: { id, tenantId: scope.tenantId },
      data: { available: false },
    });
    return count;
  }
}
