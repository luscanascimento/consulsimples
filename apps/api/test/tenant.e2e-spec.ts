import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { TokenService } from "@/auth/token.service";
import { makeTenant, makeUser } from "./factories";
import { prisma, resetDb } from "./setup";

describe("tenant settings", () => {
  let app: INestApplication;
  let tokens: TokenService;
  let ownerToken: string;
  let waiterToken: string;
  let tenantId: string;
  let otherTenantId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tokens = app.get(TokenService);
  });

  beforeEach(async () => {
    await resetDb();
    const tenant = await makeTenant({ name: "Bar do Teste" });
    tenantId = tenant.id;
    otherTenantId = (await makeTenant({ name: "Bar do Vizinho" })).id;
    const owner = await makeUser(tenant.id, { role: "OWNER" });
    const waiter = await makeUser(tenant.id, { role: "WAITER" });
    ownerToken = await tokens.issueAccessToken({ sub: owner.id, tenantId, role: "OWNER" });
    waiterToken = await tokens.issueAccessToken({ sub: waiter.id, tenantId, role: "WAITER" });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  it("updates the tenant of the token", async () => {
    const res = await request(app.getHttpServer())
      .patch("/tenant")
      .set(auth(ownerToken))
      .send({ name: "Bar do Onboarding", timezone: "America/Bahia" })
      .expect(200);

    expect(res.body).toEqual({
      id: tenantId,
      name: "Bar do Onboarding",
      timezone: "America/Bahia",
    });
  });

  it("denies an operational role", async () => {
    await request(app.getHttpServer())
      .patch("/tenant")
      .set(auth(waiterToken))
      .send({ name: "Bar do Garçom" })
      .expect(403);

    const untouched = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(untouched.name).toBe("Bar do Teste");
  });

  // O id vem do token: mandar outro no payload não pode virar edição do vizinho.
  it("ignores an id smuggled in the payload", async () => {
    await request(app.getHttpServer())
      .patch("/tenant")
      .set(auth(ownerToken))
      .send({ id: otherTenantId, name: "Sequestrado" })
      .expect(422);

    const neighbour = await prisma.tenant.findUniqueOrThrow({ where: { id: otherTenantId } });
    expect(neighbour.name).toBe("Bar do Vizinho");
  });
});
