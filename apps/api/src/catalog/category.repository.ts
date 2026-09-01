import { Injectable } from "@nestjs/common";
import { defined } from "@/common/defined";
import type { Scope } from "@/common/scope";
import { PrismaService } from "@/prisma/prisma.service";

const SELECT = { id: true, name: true, sortOrder: true, active: true } as const;

@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(scope: Scope) {
    return this.prisma.category.findMany({
      where: { tenantId: scope.tenantId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 100,
      select: SELECT,
    });
  }

  // findFirst com tenantId, nunca findUnique por id: findUnique ignora o filtro de tenant.
  findById(scope: Scope, id: string) {
    return this.prisma.category.findFirst({
      where: { id, tenantId: scope.tenantId, active: true },
      select: SELECT,
    });
  }

  create(scope: Scope, data: { name: string; sortOrder: number }) {
    return this.prisma.category.create({
      data: { ...data, tenantId: scope.tenantId },
      select: SELECT,
    });
  }

  // updateMany com tenantId no where: `update` por id único ignoraria o escopo.
  // `| undefined` explícito: o tsconfig usa exactOptionalPropertyTypes, e o dto parcial
  // do zod carrega as chaves ausentes como undefined.
  async update(
    scope: Scope,
    id: string,
    data: { name?: string | undefined; sortOrder?: number | undefined },
  ) {
    const { count } = await this.prisma.category.updateMany({
      where: { id, tenantId: scope.tenantId, active: true },
      data: defined(data),
    });
    return count;
  }

  async deactivate(scope: Scope, id: string) {
    const { count } = await this.prisma.category.updateMany({
      where: { id, tenantId: scope.tenantId, active: true },
      data: { active: false },
    });
    return count;
  }
}
