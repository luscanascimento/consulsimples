import { PrismaClient } from "@prisma/client";

// Atalho de ambiente de teste: ativa o tenant sem passar pelo link de email, que o e2e
// não tem como abrir. Fora de teste isso é um botão de reativar tenant SUSPENDED sem
// decisão humana — por isso a trava de NODE_ENV, e não só um comentário pedindo cuidado.
if (process.env.NODE_ENV === "production") {
  throw new Error("activate-tenant é script de teste e não roda em produção");
}

const email = process.argv[2];
if (!email) throw new Error("uso: node activate-tenant.ts <email>");

const prisma = new PrismaClient();
const user = await prisma.user.findUniqueOrThrow({ where: { email } });
await prisma.tenant.update({ where: { id: user.tenantId }, data: { status: "ACTIVE" } });
await prisma.$disconnect();
console.log(`tenant de ${email} ativado`);
