/**
 * Semilla inicial: crea el primer usuario ADMINISTRADOR usando
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD de .env. Sin este usuario no hay
 * forma de entrar al sistema la primera vez (no existe registro público de
 * usuarios, por seguridad — sección 20/22: los usuarios los crea un
 * administrador desde el módulo de usuarios).
 *
 * Ejecutar con: npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en tu .env antes de correr el seed.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`El usuario ${email} ya existe. No se crea de nuevo.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.create({
    data: {
      name: 'Administrador',
      email,
      passwordHash,
      role: 'ADMINISTRADOR',
      status: 'ACTIVO',
    },
  });

  console.log(`Usuario administrador creado: ${admin.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
