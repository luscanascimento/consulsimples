import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { TokenService } from "@/auth/token.service";
import { makeCategory, makeProduct, makeTenant, makeUser } from "./factories";
import { prisma, resetDb } from "./setup";

describe("tenant isolation", () => {
  let app: INestApplication;
  let tokens: TokenService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tokens = app.get(TokenService);
  });

  beforeEach(resetDb);
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // Dois restaurantes distintos; o token é sempre do tenant A, os recursos são do tenant B.
  const twoTenants = async () => {
    const [a, b] = await Promise.all([makeTenant(), makeTenant()]);
    const userA = await makeUser(a.id, { role: "OWNER" });
    const categoryB = await makeCategory(b.id);
    const productB = await makeProduct(b.id, categoryB.id);
    const tokenA = await tokens.issueAccessToken({
      sub: userA.id,
      tenantId: a.id,
      role: "OWNER",
    });
    return { tokenA, categoryB, productB, tenantA: a };
  };

  it("never lists resources from another tenant", async () => {
    const { tokenA } = await twoTenants();
    const categories = await request(app.getHttpServer())
      .get("/categories")
      .set("authorization", `Bearer ${tokenA}`)
      .expect(200);
    const products = await request(app.getHttpServer())
      .get("/products")
      .set("authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(categories.body).toEqual([]);
    expect(products.body).toEqual([]);
  });

  it("returns 404 — not 403 — when reading another tenant's product", async () => {
    const { tokenA, productB } = await twoTenants();
    await request(app.getHttpServer())
      .get(`/products/${productB.id}`)
      .set("authorization", `Bearer ${tokenA}`)
      .expect(404);
  });

  it("returns 404 when updating another tenant's product and leaves it untouched", async () => {
    const { tokenA, productB } = await twoTenants();
    await request(app.getHttpServer())
      .patch(`/products/${productB.id}`)
      .set("authorization", `Bearer ${tokenA}`)
      .send({ priceCents: 1 })
      .expect(404);

    const fresh = await prisma.product.findUniqueOrThrow({ where: { id: productB.id } });
    expect(fresh.priceCents).toBe(productB.priceCents);
  });

  it("returns 404 when deleting another tenant's category and leaves it untouched", async () => {
    const { tokenA, categoryB } = await twoTenants();
    await request(app.getHttpServer())
      .delete(`/categories/${categoryB.id}`)
      .set("authorization", `Bearer ${tokenA}`)
      .expect(404);

    expect(await prisma.category.count({ where: { id: categoryB.id } })).toBe(1);
  });

  it("refuses to create a product under another tenant's category", async () => {
    const { tokenA, categoryB } = await twoTenants();
    await request(app.getHttpServer())
      .post("/products")
      .set("authorization", `Bearer ${tokenA}`)
      .send({ name: "Invasor", categoryId: categoryB.id, priceCents: 100 })
      .expect(404);
  });

  it("ignores a tenantId sent in the body", async () => {
    const { tokenA, tenantA } = await twoTenants();
    const other = await makeTenant();
    await request(app.getHttpServer())
      .post("/categories")
      .set("authorization", `Bearer ${tokenA}`)
      .send({ name: "Bebidas", tenantId: other.id })
      .expect(422); // schema é .strict(): campo desconhecido é rejeitado, não ignorado

    const created = await request(app.getHttpServer())
      .post("/categories")
      .set("authorization", `Bearer ${tokenA}`)
      .send({ name: "Bebidas" })
      .expect(201);
    expect(created.body.tenantId).toBeUndefined(); // tenantId não vaza na resposta
    const row = await prisma.category.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.tenantId).toBe(tenantA.id);
  });
});
