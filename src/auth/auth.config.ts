import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import type { Role } from './permissions';

/**
 * Configuración de NextAuth v4 (App Router) con proveedor Credentials
 * (email + contraseña). Se eligió self-hosted en vez de un proveedor externo
 * (Clerk/Auth0/Supabase Auth) por decisión explícita del usuario: control
 * total de roles y cero dependencias de terceros de pago.
 *
 * Estrategia de sesión: JWT (no requiere consultar la DB en cada request;
 * el rol viaja firmado dentro del token). El rol SIEMPRE se reconsulta en el
 * callback `jwt` cuando el token se crea o refresca, nunca se confía en un
 * rol viejo cacheado indefinidamente si el usuario fue desactivado.
 */
export const authConfig: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8 horas
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Credenciales',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });

        if (!user || user.status !== 'ACTIVO') {
          return null;
        }

        const passwordValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!passwordValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: Role }).role;
        token.id = user.id;
      } else if (token.id) {
        // Re-verifica en cada request que el usuario siga activo y con el
        // mismo rol (evita que un usuario desactivado siga usando un token
        // firmado válido hasta que expire).
        const dbUser = await prisma.user.findUnique({ where: { id: token.id as string } });
        if (!dbUser || dbUser.status !== 'ACTIVO') {
          return {}; // invalida el token
        }
        token.role = dbUser.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
