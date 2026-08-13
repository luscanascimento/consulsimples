import { Injectable } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import { defined } from "@/common/defined";
import type { Scope } from "@/common/scope";
import { PrismaService } from "@/prisma/prisma.service";

// select explícito: passwordHash nunca entra na resposta.
const SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  lastLoginAt: true,
} as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(scope: Scope) {
    return this.prisma.user.findMany({
      where: { tenantId: scope.tenantId },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: SELECT,
    });
  }

  // findFirst com tenantId, nunca findUnique por id: findUnique ignora o filtro de tenant.
  findById(scope: Scope, id: string) {
    return this.prisma.user.findFirst({ where: { id, tenantId: scope.tenantId }, select: SELECT });
  }

  create(scope: Scope, data: { name: string; email: string; passwordHash: string; role: UserRole }) {
    return this.prisma.user.create({ data: { ...data, tenantId: scope.tenantId }, select: SELECT });
  }

  // `| undefined` explícito + defined(): o tsconfig usa exactOptionalPropertyTypes e o dto
  // parcial do zod carrega as chaves ausentes como undefined, que o Prisma recusa.
  async update(
    scope: Scope,
    id: string,
    data: { name?: string | undefined; role?: UserRole | undefined },
  ) {
    const { count } = await this.prisma.user.updateMany({
      where: { id, tenantId: scope.tenantId },
      data: defined(data),
    });
    return count;
  }

  async disable(scope: Scope, id: string) {
    const { count } = await this.prisma.user.updateMany({
      where: { id, tenantId: scope.tenantId, status: "ACTIVE" },
      data: { status: "DISABLED" },
    });
    return count;
  }

  countActiveOwners(scope: Scope) {
    return this.prisma.user.count({
      where: { tenantId: scope.tenantId, role: "OWNER", status: "ACTIVE" },
    });
  }

  // Unicidade de email é global no sistema, então esta checagem não leva Scope.
  findByEmailUnscoped(email: string) {
    return this.prisma.user.findUnique({ where: { email }, select: { id: true } });
  }
}
