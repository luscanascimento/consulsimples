import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { TokenService } from "@/auth/token.service";
import { makeTenant, makeUser } from "./factories";
import { prisma, resetDb } from "./setup";

describe("catalog", () => {
  let app: INestApplication;
  let tokens: TokenService;
  let ownerToken: string;
  let waiterToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tokens = app.get(TokenService);
  });

  beforeEach(async () => {
    await resetDb();
    const tenant = await makeTenant();
    const owner = await makeUser(tenant.id, { role: "OWNER" });
    const waiter = await makeUser(tenant.id, { role: "WAITER" });
    ownerToken = await tokens.issueAccessToken({
      sub: owner.id,
      tenantId: tenant.id,
      role: "OWNER",
    });
    waiterToken = await tokens.issueAccessToken({
      sub: waiter.id,
      tenantId: tenant.id,
      role: "WAITER",
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  it("creates a category and lists it", async () => {
    const created = await request(app.getHttpServer())
      .post("/categories")
      .set(auth(ownerToken))
      .send({ name: "Bebidas", sortOrder: 1 })
      .expect(201);

    expect(created.body).toEqual({
      id: expect.any(String),
      name: "Bebidas",
      sortOrder: 1,
      active: true,
    });

    const list = await request(app.getHttpServer())
      .get("/categories")
      .set(auth(ownerToken))
      .expect(200);
    expect(list.body).toHaveLength(1);
  });

  it("rejects a duplicated category name in the same tenant", async () => {
    await request(app.getHttpServer())
      .post("/categories")
      .set(auth(ownerToken))
      .send({ name: "Bebidas" })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post("/categories")
      .set(auth(ownerToken))
      .send({ name: "Bebidas" })
      .expect(409);
    expect(res.body.error.code).toBe("CATALOG_001");
  });

  it("lets a waiter read the catalog but not change it", async () => {
    await request(app.getHttpServer()).get("/categories").set(auth(waiterToken)).expect(200);
    await request(app.getHttpServer())
      .post("/categories")
      .set(auth(waiterToken))
      .send({ name: "Sobremesas" })
      .expect(403);
  });

  it("creates a product with price in cents", async () => {
    const category = await request(app.getHttpServer())
      .post("/categories")
      .set(auth(ownerToken))
      .send({ name: "Lanches" })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post("/products")
      .set(auth(ownerToken))
      .send({ name: "X-Salada", categoryId: category.body.id, priceCents: 2350 })
      .expect(201);

    expect(created.body).toEqual({
      id: expect.any(String),
      name: "X-Salada",
      description: null,
      categoryId: category.body.id,
      priceCents: 2350,
      available: true,
      sortOrder: 0,
    });
  });

  it("rejects a fractional or negative price", async () => {
    const category = await request(app.getHttpServer())
      .post("/categories")
      .set(auth(ownerToken))
      .send({ name: "Lanches" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/products")
      .set(auth(ownerToken))
      .send({ name: "X", categoryId: category.body.id, priceCents: 23.5 })
      .expect(422);

    await request(app.getHttpServer())
      .post("/products")
      .set(auth(ownerToken))
      .send({ name: "X", categoryId: category.body.id, priceCents: -1 })
      .expect(422);
  });

  it("updates the price and keeps the product id", async () => {
    const category = await request(app.getHttpServer())
      .post("/categories")
      .set(auth(ownerToken))
      .send({ name: "Lanches" })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post("/products")
      .set(auth(ownerToken))
      .send({ name: "X-Salada", categoryId: category.body.id, priceCents: 2350 })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/products/${product.body.id}`)
      .set(auth(ownerToken))
      .send({ priceCents: 2500 })
      .expect(200);

    expect(updated.body.id).toBe(product.body.id);
    expect(updated.body.priceCents).toBe(2500);
  });

  it("deactivates instead of deleting the row", async () => {
    const category = await request(app.getHttpServer())
      .post("/categories")
      .set(auth(ownerToken))
      .send({ name: "Lanches" })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/categories/${category.body.id}`)
      .set(auth(ownerToken))
      .expect(204);

    const row = await prisma.category.findUniqueOrThrow({ where: { id: category.body.id } });
    expect(row.active).toBe(false); // nada é deletado de verdade
  });
});
