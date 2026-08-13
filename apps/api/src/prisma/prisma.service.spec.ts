import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
  const prisma = new PrismaService();
  afterAll(async () => prisma.$disconnect());

  it("connects to postgres", async () => {
    await prisma.$connect();
    const rows = await prisma.tenant.findMany({ take: 1 });
    expect(Array.isArray(rows)).toBe(true);
  });
});
