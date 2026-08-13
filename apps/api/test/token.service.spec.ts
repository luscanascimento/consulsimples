import { JwtService } from "@nestjs/jwt";
import { TokenService } from "@/auth/token.service";
import { PrismaService } from "@/prisma/prisma.service";
import { AppError } from "@/common/app-error";
import { makeTenant, makeUser } from "./factories";
import { resetDb, prisma } from "./setup";

describe("TokenService", () => {
  const prismaService = new PrismaService();
  const service = new TokenService(prismaService, new JwtService({}));

  beforeEach(resetDb);
  afterAll(async () => {
    await prismaService.$disconnect();
    await prisma.$disconnect();
  });

  it("issues an access token that verifies back to the same claims", async () => {
    const token = await service.issueAccessToken({ sub: "u1", tenantId: "t1", role: "OWNER" });
    const claims = await service.verifyAccessToken(token);
    expect(claims).toMatchObject({ sub: "u1", tenantId: "t1", role: "OWNER" });
  });

  it("rejects a tampered access token", async () => {
    const token = await service.issueAccessToken({ sub: "u1", tenantId: "t1", role: "OWNER" });
    await expect(service.verifyAccessToken(`${token}x`)).rejects.toBeInstanceOf(AppError);
  });

  it("stores only the hash of the refresh token, never the raw value", async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const raw = await service.issueRefreshToken(user.id);
    const rows = await prisma.refreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(raw);
    expect(rows[0]!.tokenHash).toHaveLength(64); // sha256 em hex
  });

  it("rotates: revokes the old token and issues a new one in the same family", async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const first = await service.issueRefreshToken(user.id);
    const { refreshToken: second, userId } = await service.rotateRefreshToken(first);

    expect(userId).toBe(user.id);
    expect(second).not.toBe(first);
    const rows = await prisma.refreshToken.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.revokedAt).not.toBeNull();
    expect(rows[0]!.replacedBy).toBe(rows[1]!.id);
    expect(rows[1]!.familyId).toBe(rows[0]!.familyId);
  });

  it("detects reuse: replaying a rotated token revokes the whole family", async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const first = await service.issueRefreshToken(user.id);
    await service.rotateRefreshToken(first);

    await expect(service.rotateRefreshToken(first)).rejects.toBeInstanceOf(AppError);

    const rows = await prisma.refreshToken.findMany();
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it("rejects an unknown refresh token", async () => {
    await expect(service.rotateRefreshToken("nao-existe")).rejects.toBeInstanceOf(AppError);
  });

  it("rejects an expired refresh token", async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const raw = await service.issueRefreshToken(user.id);
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(service.rotateRefreshToken(raw)).rejects.toBeInstanceOf(AppError);
  });
});
