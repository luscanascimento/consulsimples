import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerStorage, type ThrottlerStorageService } from "@nestjs/throttler";
import request from "supertest";
import { AppModule } from "@/app.module";
import { PasswordService } from "@/auth/password.service";
import { MAILER, type Mailer } from "@/mail/mailer.port";
import { makeTenant, makeUser } from "./factories";
import { prisma, resetDb } from "./setup";

class FakeMailer implements Mailer {
  sent: { kind: "verify" | "reset"; to: string; link: string }[] = [];
  async sendEmailVerification(to: string, link: string) {
    this.sent.push({ kind: "verify", to, link });
  }
  async sendPasswordReset(to: string, link: string) {
    this.sent.push({ kind: "reset", to, link });
  }
}

const OLD = "senha-antiga-longa";
const NEW = "senha-nova-bem-longa";

describe("password reset", () => {
  let app: INestApplication;
  let passwords: PasswordService;
  const mailer = new FakeMailer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    passwords = app.get(PasswordService);
  });

  beforeEach(async () => {
    await resetDb();
    mailer.sent = [];
    // /auth/forgot-password aceita 3 por hora por (ip + email) e a suíte toda usa o mesmo
    // email do mesmo IP: sem zerar, do quarto teste em diante a resposta seria 429.
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
      passwordHash: await passwords.hash(OLD),
    });
  };

  const linkToken = () => new URL(mailer.sent.at(-1)!.link).searchParams.get("token")!;

  it("answers 202 and sends a link for a known email", async () => {
    await seedUser();
    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "ze@bar.com" })
      .expect(202);

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.kind).toBe("reset");
    expect(mailer.sent[0]!.link).toContain("/redefinir-senha?token=");
  });

  it("answers 202 for an unknown email and sends nothing", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "ninguem@bar.com" })
      .expect(202);

    // Corpo idêntico ao caso conhecido: a resposta não pode revelar que a conta existe.
    expect(res.body).toEqual({ ok: true });
    expect(mailer.sent).toHaveLength(0);
  });

  it("resets the password and lets the user log in with the new one", async () => {
    await seedUser();
    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "ze@bar.com" })
      .expect(202);

    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token: linkToken(), password: NEW })
      .expect(200, { ok: true });

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: NEW })
      .expect(200);

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: OLD })
      .expect(401);
  });

  it("revokes every open session when the password changes", async () => {
    const user = await seedUser();
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: OLD })
      .expect(200);

    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "ze@bar.com" })
      .expect(202);
    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token: linkToken(), password: NEW })
      .expect(200);

    // A sessão aberta antes da troca não sobrevive.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);

    const tokens = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it("refuses to reuse a reset token", async () => {
    await seedUser();
    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "ze@bar.com" })
      .expect(202);
    const token = linkToken();

    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token, password: NEW })
      .expect(200);
    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token, password: "outra-senha-longa" })
      .expect(400);
  });

  it("refuses an expired reset token", async () => {
    await seedUser();
    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "ze@bar.com" })
      .expect(202);
    await prisma.passwordResetToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token: linkToken(), password: NEW })
      .expect(400);
  });

  it("rejects a new password shorter than 12 characters", async () => {
    await seedUser();
    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "ze@bar.com" })
      .expect(202);

    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token: linkToken(), password: "curta" })
      .expect(422);
  });
});
