import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerStorage, type ThrottlerStorageService } from "@nestjs/throttler";
import request from "supertest";
import { AppModule } from "@/app.module";
import { MAILER, type Mailer } from "@/mail/mailer.port";
import { prisma, resetDb } from "./setup";

class FakeMailer implements Mailer {
  sent: { to: string; link: string }[] = [];
  async sendEmailVerification(to: string, link: string) {
    this.sent.push({ to, link });
  }
  // Signup não dispara reset de senha: se disparar, o toHaveLength do teste acusa.
  async sendPasswordReset(to: string, link: string) {
    this.sent.push({ to, link });
  }
}

describe("POST /auth/signup", () => {
  let app: INestApplication;
  const mailer = new FakeMailer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await resetDb();
    mailer.sent = [];
    // /auth/signup aceita 3 por hora por IP e a suíte inteira sai do mesmo IP:
    // sem zerar, do quarto cadastro em diante a resposta seria 429.
    app.get<ThrottlerStorageService>(ThrottlerStorage).storage.clear();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const payload = {
    restaurantName: "Bar do Zé",
    ownerName: "José",
    email: "ze@bar.com",
    password: "senha-bem-comprida",
  };

  it("creates tenant and owner in a single transaction", async () => {
    // A resposta não devolve id nenhum: seria a diferença que denuncia se a conta já existia.
    await request(app.getHttpServer())
      .post("/auth/signup")
      .send(payload)
      .expect(201, { ok: true });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ze@bar.com" } });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    expect(tenant.status).toBe("PENDING_VERIFICATION");
    expect(user.role).toBe("OWNER");
    expect(user.passwordHash).not.toBe(payload.password);
  });

  it("sends exactly one verification email with a link to the web app", async () => {
    await request(app.getHttpServer()).post("/auth/signup").send(payload).expect(201);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe("ze@bar.com");
    expect(mailer.sent[0]!.link).toContain("/verificar-email?token=");
  });

  it("stores only the hash of the verification token", async () => {
    await request(app.getHttpServer()).post("/auth/signup").send(payload).expect(201);
    const rawToken = new URL(mailer.sent[0]!.link).searchParams.get("token")!;
    const row = await prisma.emailVerificationToken.findFirstOrThrow();
    expect(row.tokenHash).not.toBe(rawToken);
  });

  it("swallows a duplicated email without leaking that it exists", async () => {
    await request(app.getHttpServer()).post("/auth/signup").send(payload).expect(201);
    // Mesmo status e mesmo corpo do cadastro que deu certo: para quem varre uma lista de
    // emails, as duas respostas são a mesma resposta.
    await request(app.getHttpServer())
      .post("/auth/signup")
      .send(payload)
      .expect(201, { ok: true });

    expect(await prisma.tenant.count()).toBe(1); // e nada foi criado do lado de cá
    expect(await prisma.user.count()).toBe(1);
    expect(mailer.sent).toHaveLength(1); // nem email para o dono da conta original
  });

  it("rejects a password shorter than 12 characters with VALIDATION_001", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ ...payload, password: "curta" })
      .expect(422);
    expect(res.body.error.code).toBe("VALIDATION_001");
  });

  it("rejects unknown fields", async () => {
    await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ ...payload, role: "OWNER" })
      .expect(422);
  });

  it("activates the tenant when the verification token is used", async () => {
    await request(app.getHttpServer()).post("/auth/signup").send(payload).expect(201);
    const token = new URL(mailer.sent[0]!.link).searchParams.get("token")!;

    await request(app.getHttpServer())
      .post("/auth/verify-email")
      .send({ token })
      .expect(200, { ok: true });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ze@bar.com" } });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    expect(tenant.status).toBe("ACTIVE");
  });

  it("refuses to reuse a verification token", async () => {
    await request(app.getHttpServer()).post("/auth/signup").send(payload).expect(201);
    const token = new URL(mailer.sent[0]!.link).searchParams.get("token")!;
    await request(app.getHttpServer()).post("/auth/verify-email").send({ token }).expect(200);
    await request(app.getHttpServer()).post("/auth/verify-email").send({ token }).expect(400);
  });

  it("refuses an expired verification token", async () => {
    await request(app.getHttpServer()).post("/auth/signup").send(payload).expect(201);
    const token = new URL(mailer.sent[0]!.link).searchParams.get("token")!;
    await prisma.emailVerificationToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer()).post("/auth/verify-email").send({ token }).expect(400);
  });
});
