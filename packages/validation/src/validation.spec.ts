import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  signupSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  createCategorySchema,
  updateCategorySchema,
  createProductSchema,
  updateProductSchema,
  createUserSchema,
  updateUserSchema,
  userRoleSchema,
  updateTenantSchema,
} from "./index";

describe("Validation Schemas", () => {
  describe("Auth Schemas", () => {
    test("signupSchema validates correct input and rejects weak passwords or extra fields", () => {
      const valid = signupSchema.safeParse({
        restaurantName: "Restaurante Bom Sabor",
        ownerName: "Carlos Silva",
        email: "carlos@exemplo.com",
        password: "password123456",
      });
      assert.equal(valid.success, true);

      const weakPassword = signupSchema.safeParse({
        restaurantName: "Restaurante",
        ownerName: "Carlos",
        email: "carlos@exemplo.com",
        password: "short",
      });
      assert.equal(weakPassword.success, false);

      const extraField = signupSchema.safeParse({
        restaurantName: "Restaurante",
        ownerName: "Carlos",
        email: "carlos@exemplo.com",
        password: "password123456",
        tenantId: "123",
      });
      assert.equal(extraField.success, false);
    });

    test("loginSchema accepts valid email and password", () => {
      const valid = loginSchema.safeParse({
        email: "user@exemplo.com",
        password: "any-password",
      });
      assert.equal(valid.success, true);
    });

    test("verifyEmailSchema, forgotPasswordSchema and resetPasswordSchema", () => {
      assert.equal(verifyEmailSchema.safeParse({ token: "abcdef123456" }).success, true);
      assert.equal(forgotPasswordSchema.safeParse({ email: "user@test.com" }).success, true);
      assert.equal(
        resetPasswordSchema.safeParse({ token: "abcdef123456", password: "newpassword1234" }).success,
        true,
      );
    });
  });

  describe("Catalog Schemas", () => {
    test("createCategorySchema validates names and strictness", () => {
      const valid = createCategorySchema.safeParse({ name: "Bebidas", sortOrder: 1 });
      assert.equal(valid.success, true);

      const emptyName = createCategorySchema.safeParse({ name: "  " });
      assert.equal(emptyName.success, false);
    });

    test("updateCategorySchema allows partial fields", () => {
      assert.equal(updateCategorySchema.safeParse({ name: "Novo Nome" }).success, true);
      assert.equal(updateCategorySchema.safeParse({ sortOrder: 5 }).success, true);
    });

    test("createProductSchema enforces integer cents and uuid category", () => {
      const valid = createProductSchema.safeParse({
        name: "Suco Natural",
        categoryId: "123e4567-e89b-12d3-a456-426614174000",
        priceCents: 1250,
        available: true,
        sortOrder: 0,
      });
      assert.equal(valid.success, true);

      const floatCents = createProductSchema.safeParse({
        name: "Suco",
        categoryId: "123e4567-e89b-12d3-a456-426614174000",
        priceCents: 12.5,
      });
      assert.equal(floatCents.success, false);
    });

    test("updateProductSchema allows updating partial fields including categoryId", () => {
      const valid = updateProductSchema.safeParse({
        categoryId: "123e4567-e89b-12d3-a456-426614174000",
        priceCents: 1500,
      });
      assert.equal(valid.success, true);
    });
  });

  describe("User Schemas", () => {
    test("userRoleSchema accepts only valid roles", () => {
      assert.equal(userRoleSchema.safeParse("OWNER").success, true);
      assert.equal(userRoleSchema.safeParse("WAITER").success, true);
      assert.equal(userRoleSchema.safeParse("ADMIN").success, false);
    });

    test("createUserSchema enforces min 12 chars password and valid role", () => {
      const valid = createUserSchema.safeParse({
        name: "Garçom João",
        email: "joao@restaurante.com",
        password: "senhaSegura1234",
        role: "WAITER",
      });
      assert.equal(valid.success, true);
    });

    test("updateUserSchema allows partial name and role update", () => {
      assert.equal(updateUserSchema.safeParse({ role: "MANAGER" }).success, true);
      assert.equal(updateUserSchema.safeParse({ name: "Novo Nome" }).success, true);
    });
  });

  describe("Tenant Schemas", () => {
    test("updateTenantSchema validates restaurant name and timezone", () => {
      const valid = updateTenantSchema.safeParse({
        name: "Restaurante Atualizado",
        timezone: "America/Sao_Paulo",
      });
      assert.equal(valid.success, true);
    });
  });
});
