import { EnvSchema } from "./env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  CORS_ORIGINS: "http://localhost:3000",
  RESEND_API_KEY: "k",
  MAIL_FROM: "no-reply@consusimples.local",
  WEB_BASE_URL: "http://localhost:3000",
};

describe("EnvSchema", () => {
  it("applies defaults for optional values", () => {
    const env = EnvSchema.parse(valid);
    expect(env.PORT).toBe(3001);
    expect(env.TRUST_PROXY_HOPS).toBe(1);
    expect(env.NODE_ENV).toBe("development");
  });

  it("rejects a secret shorter than 32 characters", () => {
    const r = EnvSchema.safeParse({ ...valid, JWT_ACCESS_SECRET: "short" });
    expect(r.success).toBe(false);
  });

  it("splits CORS_ORIGINS into a list of urls", () => {
    const env = EnvSchema.parse({ ...valid, CORS_ORIGINS: "http://a.com, http://b.com" });
    expect(env.CORS_ORIGINS).toEqual(["http://a.com", "http://b.com"]);
  });

  it("rejects a DATABASE_URL that is not postgresql", () => {
    const r = EnvSchema.safeParse({ ...valid, DATABASE_URL: "mysql://u:p@h:3306/d" });
    expect(r.success).toBe(false);
  });
});
