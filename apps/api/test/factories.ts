import { randomUUID } from "node:crypto";
import { prisma } from "./setup";

export const makeTenant = (
  over: Partial<{
    name: string;
    slug: string;
    status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";
  }> = {},
) =>
  prisma.tenant.create({
    data: {
      name: over.name ?? "Bar do Teste",
      slug: over.slug ?? `bar-${randomUUID().slice(0, 8)}`,
      status: over.status ?? "ACTIVE",
    },
  });

export const makeUser = (
  tenantId: string,
  over: Partial<{
    email: string;
    name: string;
    role: "OWNER" | "MANAGER" | "WAITER" | "KITCHEN" | "CASHIER";
    passwordHash: string;
  }> = {},
) =>
  prisma.user.create({
    data: {
      tenantId,
      email: over.email ?? `u-${randomUUID()}@test.dev`,
      name: over.name ?? "Teste",
      role: over.role ?? "OWNER",
      passwordHash: over.passwordHash ?? "not-a-real-hash",
    },
  });

export const makeCategory = (
  tenantId: string,
  over: Partial<{ name: string; sortOrder: number }> = {},
) =>
  prisma.category.create({
    data: {
      tenantId,
      name: over.name ?? `Categoria ${randomUUID().slice(0, 6)}`,
      sortOrder: over.sortOrder ?? 0,
    },
  });

export const makeProduct = (
  tenantId: string,
  categoryId: string,
  over: Partial<{ name: string; priceCents: number; available: boolean }> = {},
) =>
  prisma.product.create({
    data: {
      tenantId,
      categoryId,
      name: over.name ?? `Produto ${randomUUID().slice(0, 6)}`,
      priceCents: over.priceCents ?? 1990,
      available: over.available ?? true,
    },
  });
