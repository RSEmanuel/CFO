/** Imprime un Authorization header dev-bypass para probar APIs locales. */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { email: true, tenantId: true, role: true },
  });
  if (!user) throw new Error("Sin usuarios activos");
  console.log(JSON.stringify(user));
  console.log(`Authorization: Bearer dev-bypass.dev-user:${user.email.toLowerCase()}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
