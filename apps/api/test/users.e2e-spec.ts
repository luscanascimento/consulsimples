import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { TokenService } from "@/auth/token.service";
import { makeTenant, makeUser } from "./factories";
import { prisma, resetDb } from "./setup";

describe("users", () => {
  let app: INestApplication;
  let tokens: TokenService;
  let ownerToken: string;
  let waiterToken: string;
  let tenantId: string;
  let ownerId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tokens = app.get(TokenService);
  });

  beforeEach(async () => {
    await resetDb();
    const tenant = await makeTenant();
    tenantId = tenant.id;
    const owner = await makeUser(tenant.id, { role: "OWNER" });
    ownerId = owner.id;
    const waiter = await makeUser(tenant.id, { role: "WAITER" });
    ownerToken = await tokens.issueAccessToken({ sub: owner.id, tenantId, role: "OWNER" });
    waiterToken = await tokens.issueAccessToken({ sub: waiter.id, tenantId, role: "WAITER" });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  it("lists users of the tenant without leaking the password hash", async () => {
    const res = await request(app.getHttpServer()).get("/users").set(auth(ownerToken)).expect(200);
    expect(res.body).toHaveLength(2);
    for (const u of res.body) {
      expect(u.passwordHash).toBeUndefined();
      expect(u).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        email: expect.any(String),
        role: expect.any(String),
        status: expect.any(String),
        lastLoginAt: null,
      });
    }
  });

  it("denies the whole users module to a waiter", async () => {
    await request(app.getHttpServer()).get("/users").set(auth(waiterToken)).expect(403);
    await request(app.getHttpServer())
      .post("/users")
      .set(auth(waiterToken))
      .send({
        name: "Novo",
        email: "novo@bar.com",
        password: "senha-bem-comprida",
        role: "WAITER",
      })
      .expect(403);
  });

  it("creates a user already hashed and bound to the tenant", async () => {
    const res = await request(app.getHttpServer())
      .post("/users")
      .set(auth(ownerToken))
      .send({
        name: "Garçom",
        email: "garcom@bar.com",
        password: "senha-bem-comprida",
        role: "WAITER",
      })
      .expect(201);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.tenantId).toBe(tenantId);
    expect(row.passwordHash).not.toBe("senha-bem-comprida");
    expect(row.role).toBe("WAITER");
  });

  it("rejects an email already taken anywhere in the system", async () => {
    const other = await makeTenant();
    await makeUser(other.id, { email: "repetido@bar.com" });

    const res = await request(app.getHttpServer())
      .post("/users")
      .set(auth(ownerToken))
      .send({
        // Nome com 2+ caracteres: com "X" o 409 viraria 422 do próprio schema e o
        // teste deixaria de exercitar a checagem de email duplicado.
        name: "Xis",
        email: "repetido@bar.com",
        password: "senha-bem-comprida",
        role: "WAITER",
      })
      .expect(409);
    expect(res.body.error.code).toBe("USER_001");
  });

  it("changes a role", async () => {
    const created = await request(app.getHttpServer())
      .post("/users")
      .set(auth(ownerToken))
      .send({
        name: "Garçom",
        email: "garcom@bar.com",
        password: "senha-bem-comprida",
        role: "WAITER",
      })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/users/${created.body.id}`)
      .set(auth(ownerToken))
      .send({ role: "CASHIER" })
      .expect(200);

    expect(updated.body.role).toBe("CASHIER");
  });

  it("refuses to disable the last owner", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/users/${ownerId}`)
      .set(auth(ownerToken))
      .expect(409);
    expect(res.body.error.code).toBe("USER_002");

    const row = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    expect(row.status).toBe("ACTIVE"); // continua podendo entrar
  });

  it("returns 404 for a user of another tenant", async () => {
    const other = await makeTenant();
    const stranger = await makeUser(other.id);
    await request(app.getHttpServer())
      .patch(`/users/${stranger.id}`)
      .set(auth(ownerToken))
      .send({ role: "WAITER" })
      .expect(404);
  });
});
