import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerStorage, type ThrottlerStorageService } from "@nestjs/throttler";
import request from "supertest";
import { AppModule } from "@/app.module";
import { PasswordService } from "@/auth/password.service";
import { makeTenant, makeUser } from "./factories";
import { prisma, resetDb } from "./setup";

const PASSWORD = "senha-bem-comprida";

describe("auth session", () => {
  let app: INestApplication;
  let passwords: PasswordService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    passwords = app.get(PasswordService);
  });

  beforeEach(async () => {
    await resetDb();
    // O contador do throttler vive em memória no app, não no banco: sem zerar entre os
    // testes, as tentativas de um teste contam no seguinte e o teste de rate limit
    // deixaria de medir o que diz medir.
    app.get<ThrottlerStorageService>(ThrottlerStorage).storage.clear();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const seedUser = async () => {
    const tenant = await makeTenant({ status: "ACTIVE" });
    return makeUser(tenant.id, {
      email: "ze@bar.com",
      passwordHash: await passwords.hash(PASSWORD),
      role: "OWNER",
    });
  };

  it("logs in with the right credentials", async () => {
    const user = await seedUser();
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: PASSWORD })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user).toEqual({
      id: user.id,
      name: user.name,
      role: "OWNER",
      tenantId: user.tenantId,
    });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("records the login timestamp", async () => {
    const user = await seedUser();
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: PASSWORD })
      .expect(200);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(fresh.lastLoginAt).not.toBeNull();
  });

  it("answers the same way for wrong password and unknown email", async () => {
    await seedUser();
    const wrongPassword = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: "outra-senha-longa" })
      .expect(401);
    const unknownEmail = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ninguem@bar.com", password: "outra-senha-longa" })
      .expect(401);

    expect(wrongPassword.body.error.code).toBe(unknownEmail.body.error.code);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it("refuses to log in while the tenant is pending verification", async () => {
    const tenant = await makeTenant({ status: "PENDING_VERIFICATION" });
    await makeUser(tenant.id, {
      email: "novo@bar.com",
      passwordHash: await passwords.hash(PASSWORD),
    });
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "novo@bar.com", password: PASSWORD })
      .expect(403);
    expect(res.body.error.code).toBe("AUTH_006");
  });

  it("refuses to log in a disabled user", async () => {
    const user = await seedUser();
    await prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: PASSWORD })
      .expect(401);
  });

  it("exchanges a refresh token for a new pair", async () => {
    await seedUser();
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: PASSWORD })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    expect(res.body.refreshToken).not.toBe(login.body.refreshToken);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it("kills the session family when a refresh token is replayed", async () => {
    await seedUser();
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: PASSWORD })
      .expect(200);

    const rotated = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);

    // o token legítimo mais recente também morre: a linhagem inteira foi revogada
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);
  });

  it("logout revokes the refresh token", async () => {
    await seedUser();
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("authorization", `Bearer ${login.body.accessToken}`)
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it("returns the current user from the token", async () => {
    const user = await seedUser();
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: PASSWORD })
      .expect(200);

    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .set("authorization", `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(me.body).toEqual({
      id: user.id,
      name: user.name,
      role: "OWNER",
      tenantId: user.tenantId,
    });
  });

  it("rate limits repeated login attempts with 429", async () => {
    await seedUser();
    const attempt = () =>
      request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "ze@bar.com", password: "senha-errada-longa" });

    for (let i = 0; i < 5; i++) await attempt().expect(401);
    await attempt().expect(429);
  });
});
