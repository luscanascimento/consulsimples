import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerStorage, type ThrottlerStorageService } from "@nestjs/throttler";
import request from "supertest";
import { AppModule } from "@/app.module";
import { TokenService } from "@/auth/token.service";
import { MAILER, type Mailer } from "@/mail/mailer.port";
import { makeCategory, makeTenant, makeUser } from "./factories";
import { prisma, resetDb } from "./setup";

// Auditoria adversarial: cada teste aqui é uma tentativa de quebrar autorização ou
// isolamento. Falhou = existe buraco.
class FakeMailer implements Mailer {
  sent: { to: string; link: string }[] = [];
  async sendEmailVerification(to: string, link: string) {
    this.sent.push({ to, link });
  }
  async sendPasswordReset(to: string, link: string) {
    this.sent.push({ to, link });
  }
}

describe("adversarial authz", () => {
  let app: INestApplication;
  let tokens: TokenService;
  const mailer = new FakeMailer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tokens = app.get(TokenService);
  });

  beforeEach(async () => {
    await resetDb();
    mailer.sent = [];
    // Limite é por hora: sem zerar o contador, um teste envenena o seguinte.
    app.get<ThrottlerStorageService>(ThrottlerStorage).storage.clear();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  // Um tenant com dono e gerente. O gerente é o atacante interno.
  const tenantWithManager = async () => {
    const tenant = await makeTenant();
    const owner = await makeUser(tenant.id, { role: "OWNER" });
    const manager = await makeUser(tenant.id, { role: "MANAGER" });
    const managerToken = await tokens.issueAccessToken({
      sub: manager.id,
      tenantId: tenant.id,
      role: "MANAGER",
    });
    const ownerToken = await tokens.issueAccessToken({
      sub: owner.id,
      tenantId: tenant.id,
      role: "OWNER",
    });
    return { tenant, owner, manager, managerToken, ownerToken };
  };

  describe("escalação de papel dentro do tenant", () => {
    it("refuses to let a MANAGER promote itself to OWNER", async () => {
      const { manager, managerToken } = await tenantWithManager();

      await request(app.getHttpServer())
        .patch(`/users/${manager.id}`)
        .set(auth(managerToken))
        .send({ role: "OWNER" })
        .expect(403);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: manager.id } });
      expect(row.role).toBe("MANAGER");
    });

    it("refuses to let a MANAGER create another OWNER", async () => {
      const { managerToken } = await tenantWithManager();

      await request(app.getHttpServer())
        .post("/users")
        .set(auth(managerToken))
        .send({
          name: "Laranja",
          email: "laranja@bar.com",
          password: "senha-bem-comprida",
          role: "OWNER",
        })
        .expect(403);

      expect(await prisma.user.count({ where: { email: "laranja@bar.com" } })).toBe(0);
    });

    it("refuses to let a MANAGER disable an OWNER", async () => {
      const { tenant, owner, managerToken } = await tenantWithManager();
      // Segundo dono: o guard do "último dono ativo" não pode ser o que segura este caso.
      await makeUser(tenant.id, { role: "OWNER" });

      await request(app.getHttpServer())
        .delete(`/users/${owner.id}`)
        .set(auth(managerToken))
        .expect(403);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
      expect(row.status).toBe("ACTIVE");
    });

    it("still lets the OWNER manage owners", async () => {
      const { tenant, owner, ownerToken } = await tenantWithManager();
      await makeUser(tenant.id, { role: "OWNER" });

      await request(app.getHttpServer())
        .delete(`/users/${owner.id}`)
        .set(auth(ownerToken))
        .expect(204);
    });
  });

  describe("rate limit das rotas que disparam email", () => {
    const signup = (n: number) =>
      request(app.getHttpServer())
        .post("/auth/signup")
        .send({
          restaurantName: `Bar ${n}`,
          ownerName: `Dono ${n}`,
          email: `spam-${n}@bar.com`,
          password: "senha-bem-comprida",
        });

    it("rate limits signup by IP even when the email changes every request", async () => {
      // Sem limite por IP, signup público é fábrica de tenant e de email para vítima
      // arbitrária: o endereço do remetente é o do produto.
      for (let i = 0; i < 3; i++) await signup(i).expect(201);
      await signup(99).expect(429);

      expect(mailer.sent).toHaveLength(3);
    });

    it("rate limits password reset by IP even when the email changes every request", async () => {
      const tenant = await makeTenant();
      for (let i = 0; i < 4; i++) await makeUser(tenant.id, { email: `alvo-${i}@bar.com` });

      const forgot = (i: number) =>
        request(app.getHttpServer())
          .post("/auth/forgot-password")
          .send({ email: `alvo-${i}@bar.com` });

      for (let i = 0; i < 3; i++) await forgot(i).expect(202);
      await forgot(3).expect(429);
    });
  });

  describe("entrada não confiável", () => {
    it("rejects a malformed categoryId in the query instead of failing with 500", async () => {
      const tenant = await makeTenant();
      const user = await makeUser(tenant.id, { role: "WAITER" });
      const token = await tokens.issueAccessToken({
        sub: user.id,
        tenantId: tenant.id,
        role: "WAITER",
      });

      const res = await request(app.getHttpServer())
        .get("/products?categoryId=nao-e-uuid")
        .set(auth(token));

      expect(res.status).toBe(400);
    });

    it("ignores a tenantId sent in the query string", async () => {
      const [a, b] = await Promise.all([makeTenant(), makeTenant()]);
      await makeCategory(b.id, { name: "Do outro" });
      const user = await makeUser(a.id, { role: "OWNER" });
      const token = await tokens.issueAccessToken({
        sub: user.id,
        tenantId: a.id,
        role: "OWNER",
      });

      const res = await request(app.getHttpServer())
        .get(`/categories?tenantId=${b.id}`)
        .set(auth(token))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it("never echoes the password hash when creating or updating a user", async () => {
      const { ownerToken } = await tenantWithManager();

      const created = await request(app.getHttpServer())
        .post("/users")
        .set(auth(ownerToken))
        .send({
          name: "Caixa",
          email: "caixa@bar.com",
          password: "senha-bem-comprida",
          role: "CASHIER",
        })
        .expect(201);
      expect(created.body.passwordHash).toBeUndefined();
      expect(created.body.tenantId).toBeUndefined();

      const updated = await request(app.getHttpServer())
        .patch(`/users/${created.body.id}`)
        .set(auth(ownerToken))
        .send({ name: "Caixa 2" })
        .expect(200);
      expect(updated.body.passwordHash).toBeUndefined();
      expect(updated.body.tenantId).toBeUndefined();
    });
  });
});
