import { Controller, Get, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { CurrentUser, Public, Roles } from "@/common/decorators";
import { TokenService, type AuthUser } from "@/auth/token.service";

@Controller("guard-probe")
class ProbeController {
  @Public()
  @Get("open")
  open() {
    return { ok: true };
  }

  @Get("closed")
  closed(@CurrentUser() user: AuthUser) {
    return { tenantId: user.tenantId };
  }

  @Roles("OWNER", "MANAGER")
  @Get("managers-only")
  managers() {
    return { ok: true };
  }
}

describe("global guards", () => {
  let app: INestApplication;
  let tokens: TokenService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tokens = app.get(TokenService);
  });

  afterAll(async () => app.close());

  const bearer = async (role: AuthUser["role"]) =>
    `Bearer ${await tokens.issueAccessToken({ sub: "u1", tenantId: "t1", role })}`;

  it("allows a route marked @Public without a token", async () => {
    await request(app.getHttpServer()).get("/guard-probe/open").expect(200, { ok: true });
  });

  it("denies a route without @Public when there is no token", async () => {
    await request(app.getHttpServer()).get("/guard-probe/closed").expect(401);
  });

  it("denies a malformed authorization header", async () => {
    await request(app.getHttpServer())
      .get("/guard-probe/closed")
      .set("authorization", "Token abc")
      .expect(401);
  });

  it("injects the authenticated user into the handler", async () => {
    await request(app.getHttpServer())
      .get("/guard-probe/closed")
      .set("authorization", await bearer("WAITER"))
      .expect(200, { tenantId: "t1" });
  });

  it("allows a role listed in @Roles", async () => {
    await request(app.getHttpServer())
      .get("/guard-probe/managers-only")
      .set("authorization", await bearer("MANAGER"))
      .expect(200, { ok: true });
  });

  it("denies a role not listed in @Roles with 403", async () => {
    await request(app.getHttpServer())
      .get("/guard-probe/managers-only")
      .set("authorization", await bearer("WAITER"))
      .expect(403);
  });
});
