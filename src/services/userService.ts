import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import type { UserInput } from '@/lib/validators/schemas';
import { recordAudit } from './auditService';

/** Módulo de usuarios (sección 20). Solo accesible con permiso 'users.manage' (ADMINISTRADOR). */
export async function listUsers() {
  return prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
  });
}

export async function createUser(input: UserInput, actingUserId: string) {
  if (!input.password) {
    throw new Error('La contraseña es obligatoria al crear un usuario.');
  }
  const passwordHash = await bcrypt.hash(input.password, 12);

  return prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase().trim(),
        passwordHash,
        role: input.role,
        status: input.status,
      },
    });
    await recordAudit(
      { userId: actingUserId, action: 'USER_CREATE', entityType: 'User', entityId: created.id, newValue: { email: created.email, role: created.role } },
      tx
    );
    return created;
  });
}

export async function updateUserRoleOrStatus(
  id: string,
  input: Pick<UserInput, 'role' | 'status'>,
  actingUserId: string
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id } });
    const updated = await tx.user.update({ where: { id }, data: { role: input.role, status: input.status } });
    await recordAudit(
      {
        userId: actingUserId,
        action: 'USER_UPDATE',
        entityType: 'User',
        entityId: id,
        previousValue: { role: before.role, status: before.status },
        newValue: { role: updated.role, status: updated.status },
      },
      tx
    );
    return updated;
  });
}
