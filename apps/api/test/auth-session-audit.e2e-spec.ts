import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerStorage, type ThrottlerStorageService } from "@nestjs/throttler";
import { createHash } from "node:crypto";
import request from "supertest";
import { AppModule } from "@/app.module";
import { PasswordService } from "@/auth/password.service";
import { MAILER, type Mailer } from "@/mail/mailer.port";
import { makeTenant, makeUser } from "./factories";
import { prisma, resetDb } from "./setup";

// Auditoria adversarial da SESSÃO: enumeração de conta, replay de refresh, reuso de token
// de uso único e revogação. Cada teste aqui é uma tentativa de quebrar o fluxo de auth.
// Falhou = existe buraco.

// O mailer real fala com a Resend pela rede: centenas de ms. Se a requisição espera o
// envio, o tempo de resposta vira oráculo — "demorou" = a conta existe. O atraso aqui
// simula essa latência de rede, exagerada para o teste ser determinístico.
const MAIL_DELAY_MS = 500;
const MAX_RESPONSE_MS = 250;

class SlowMailer implements Mailer {
  sent: { kind: "verify" | "reset"; to: string; link: string }[] = [];
  delayMs = 0;

  private async record(kind: "verify" | "reset", to: string, link: string) {
    this.sent.push({ kind, to, link });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
  }
  sendEmailVerification(to: string, link: string) {
    return this.record("verify", to, link);
  }
  sendPasswordReset(to: string, link: string) {
    return this.record("reset", to, link);
  }
}

const PASSWORD = "senha-bem-comprida";
const signupPayload = {
  restaurantName: "Bar do Zé",
  ownerName: "José",
  email: "ze@bar.com",
  password: PASSWORD,
};

const took = async (fn: () => Promise<unknown>) => {
  const started = Date.now();
  await fn();
  return Date.now() - started;
};

describe("adversarial auth session", () => {
  let app: INestApplication;
  let passwords: PasswordService;
  const mailer = new SlowMailer();

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
    mailer.delayMs = 0;
    // O contador do throttler vive em memória no app: sem zerar, as tentativas de um teste
    // contam no seguinte e o 429 de um teste vira falha do próximo.
    app.get<ThrottlerStorageService>(ThrottlerStorage).storage.clear();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  const seedUser = async (email = "ze@bar.com") => {
    const tenant = await makeTenant({ status: "ACTIVE" });
    return makeUser(tenant.id, { email, passwordHash: await passwords.hash(PASSWORD), role: "OWNER" });
  };

  const loginOk = async (email = "ze@bar.com") => {
    const res = await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200);
    return res.body as { accessToken: string; refreshToken: string };
  };

  const linkToken = (kind: "verify" | "reset") =>
    new URL(mailer.sent.filter((m) => m.kind === kind).at(-1)!.link).searchParams.get("token")!;

  // ---------------------------------------------------------------- 1. enumeração

  it("signup answers identically for a free email and for one already taken", async () => {
    const first = await http().post("/auth/signup").send(signupPayload);
    const second = await http().post("/auth/signup").send(signupPayload);

    // Status e corpo iguais: qualquer diferença responde "essa conta existe" para quem
    // varre uma lista de emails contra o signup público.
    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    // E o corpo não pode carregar identificador nenhum do que existe do outro lado.
    expect(JSON.stringify(first.body)).not.toContain("tenantId");

    // Indistinguível para fora, mas nada meio-criado para dentro.
    expect(await prisma.tenant.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
  });

  it("signup does not leak an existing account through response time", async () => {
    mailer.delayMs = MAIL_DELAY_MS;
    const fresh = await took(() => http().post("/auth/signup").send(signupPayload));
    const taken = await took(() => http().post("/auth/signup").send(signupPayload));

    // Nenhum dos dois pode esperar o provedor de email: quem espera é o caminho da conta
    // nova, e a diferença de centenas de ms enumera conta tão bem quanto um 409.
    expect(fresh).toBeLessThan(MAX_RESPONSE_MS);
    expect(taken).toBeLessThan(MAX_RESPONSE_MS);
  });

  it("forgot-password does not leak an existing account through response time", async () => {
    await seedUser();
    mailer.delayMs = MAIL_DELAY_MS;

    const known = await took(() =>
      http().post("/auth/forgot-password").send({ email: "ze@bar.com" }).expect(202),
    );
    app.get<ThrottlerStorageService>(ThrottlerStorage).storage.clear();
    const unknown = await took(() =>
      http().post("/auth/forgot-password").send({ email: "ninguem@bar.com" }).expect(202),
    );

    expect(known).toBeLessThan(MAX_RESPONSE_MS);
    expect(unknown).toBeLessThan(MAX_RESPONSE_MS);
  });

  it("login answers the same status for unknown email, wrong password and disabled user", async () => {
    const user = await seedUser();
    const attempt = (email: string, password: string) =>
      http().post("/auth/login").send({ email, password });

    const unknown = await attempt("ninguem@bar.com", PASSWORD);
    const wrong = await attempt("ze@bar.com", "senha-errada-longa");
    await prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
    const disabled = await attempt("ze@bar.com", PASSWORD);

    for (const res of [wrong, disabled]) {
      expect(res.status).toBe(unknown.status);
      expect(res.body.error.code).toBe(unknown.body.error.code);
      expect(res.body.error.message).toBe(unknown.body.error.message);
    }
  });

  // ---------------------------------------------------------------- 2. refresh

  it("lets only one of two concurrent rotations of the same token win", async () => {
    await seedUser();
    const { refreshToken } = await loginOk();

    const rotate = () => http().post("/auth/refresh").send({ refreshToken });
    const [a, b] = await Promise.all([rotate(), rotate()]);

    // Dois pares válidos com o mesmo token seria uma sessão clonada de graça.
    expect([a.status, b.status].sort()).toEqual([200, 401]);
    const alive = await prisma.refreshToken.count({ where: { revokedAt: null } });
    expect(alive).toBeLessThanOrEqual(1);
  });

  it("kills the whole family when an old token is replayed after several rotations", async () => {
    await seedUser();
    const first = await loginOk();

    let current = first.refreshToken;
    for (let i = 0; i < 3; i++) {
      const res = await http().post("/auth/refresh").send({ refreshToken: current }).expect(200);
      current = res.body.refreshToken;
    }

    // O token do login, três rotações atrás, volta: vazou.
    await http().post("/auth/refresh").send({ refreshToken: first.refreshToken }).expect(401);
    // O legítimo mais recente morre junto — é o que força login novo no dono da conta.
    await http().post("/auth/refresh").send({ refreshToken: current }).expect(401);
    const rows = await prisma.refreshToken.findMany();
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it("refuses to refresh a disabled user and burns the family", async () => {
    const user = await seedUser();
    const { refreshToken } = await loginOk();
    await prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });

    await http().post("/auth/refresh").send({ refreshToken }).expect(401);
    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it.each(["PENDING_VERIFICATION", "SUSPENDED"] as const)(
    "refuses to refresh while the tenant is %s and burns the family",
    async (status) => {
      const user = await seedUser();
      const { refreshToken } = await loginOk();
      await prisma.tenant.update({ where: { id: user.tenantId }, data: { status } });

      await http().post("/auth/refresh").send({ refreshToken }).expect(401);
      const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
      expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
    },
  );

  // ---------------------------------------------------------------- 3. tokens de uso único

  it("never stores the raw verification or reset token", async () => {
    await http().post("/auth/signup").send(signupPayload);
    const rawVerify = linkToken("verify");
    const verifyRow = await prisma.emailVerificationToken.findFirstOrThrow();
    expect(verifyRow.tokenHash).toBe(createHash("sha256").update(rawVerify).digest("hex"));
    expect(JSON.stringify(verifyRow)).not.toContain(rawVerify);

    await http().post("/auth/verify-email").send({ token: rawVerify }).expect(200);
    await http().post("/auth/forgot-password").send({ email: signupPayload.email }).expect(202);
    const rawReset = linkToken("reset");
    const resetRow = await prisma.passwordResetToken.findFirstOrThrow();
    expect(resetRow.tokenHash).toBe(createHash("sha256").update(rawReset).digest("hex"));
    expect(JSON.stringify(resetRow)).not.toContain(rawReset);
  });

  it("does not let a verification link resurrect a suspended tenant", async () => {
    const res = await http().post("/auth/signup").send(signupPayload);
    expect(res.status).toBe(201);
    const token = linkToken("verify");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: signupPayload.email } });
    await prisma.tenant.update({ where: { id: user.tenantId }, data: { status: "SUSPENDED" } });

    await http().post("/auth/verify-email").send({ token });

    // Confirmar email é PENDING_VERIFICATION -> ACTIVE, nunca um botão de reativar tenant:
    // senão um link de 24h atrás desfaz a suspensão que o operador aplicou.
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    expect(tenant.status).toBe("SUSPENDED");
  });

  it("refuses a reset token issued before an earlier reset already consumed one", async () => {
    await seedUser();
    await http().post("/auth/forgot-password").send({ email: "ze@bar.com" }).expect(202);
    const older = linkToken("reset");
    app.get<ThrottlerStorageService>(ThrottlerStorage).storage.clear();
    await http().post("/auth/forgot-password").send({ email: "ze@bar.com" }).expect(202);
    const newer = linkToken("reset");

    await http().post("/auth/reset-password").send({ token: newer, password: "nova-senha-longa" }).expect(200);
    // O link antigo, ainda dentro da validade, tem que morrer junto: senão quem interceptou
    // o primeiro email troca a senha de novo depois do dono.
    await http()
      .post("/auth/reset-password")
      .send({ token: older, password: "outra-senha-longa-x" })
      .expect(400);
  });

  // ---------------------------------------------------------------- 4/5. revogação

  it("revokes every refresh family of the user when the password is reset", async () => {
    const user = await seedUser();
    const one = await loginOk();
    const two = await loginOk(); // segundo dispositivo, outra família

    await http().post("/auth/forgot-password").send({ email: "ze@bar.com" }).expect(202);
    await http()
      .post("/auth/reset-password")
      .send({ token: linkToken("reset"), password: "nova-senha-longa" })
      .expect(200);

    for (const session of [one, two]) {
      await http().post("/auth/refresh").send({ refreshToken: session.refreshToken }).expect(401);
    }
    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  // TETO CONHECIDO, não é uma aprovação: trocar a senha mata refresh token, mas o access
  // token já emitido é auto-contido e continua valendo até expirar (15 min). Derrubá-lo
  // exigiria estado por requisição no guard. Este teste fixa o teto — se alguém fechar essa
  // janela, ele quebra e é para ser reescrito, não deletado.
  it("known ceiling: an access token minted before a password reset survives until it expires", async () => {
    await seedUser();
    const { accessToken } = await loginOk();

    await http().post("/auth/forgot-password").send({ email: "ze@bar.com" }).expect(202);
    await http()
      .post("/auth/reset-password")
      .send({ token: linkToken("reset"), password: "nova-senha-longa" })
      .expect(200);

    await http().get("/users").set("authorization", `Bearer ${accessToken}`).expect(200);
  });

  // ---------------------------------------------------------------- 6. rate limit

  it("does not let a forged X-Forwarded-For reset the login rate limit bucket", async () => {
    await seedUser();
    const attempt = (forwarded: string) =>
      http()
        .post("/auth/login")
        .set("x-forwarded-for", forwarded)
        .send({ email: "ze@bar.com", password: "senha-errada-longa" });

    // Um IP novo por tentativa. Se o tracker lesse o header cru, o contador nunca subiria.
    for (let i = 0; i < 5; i++) await attempt(`203.0.113.${i}`).expect(401);
    await attempt("203.0.113.99").expect(429);
  });
});
