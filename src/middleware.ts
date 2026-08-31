import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/**
 * Protección de rutas a nivel de servidor (sección 22: "Protección de
 * rutas"). Cualquier ruta bajo el grupo (dashboard) requiere sesión válida;
 * sin sesión, redirige a /login. Esto es la primera línea de defensa;
 * cada Server Action/Route Handler además verifica permisos por rol
 * (ver src/auth/permissions.ts) porque tener sesión no implica tener
 * permiso para una acción específica.
 */
export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token?.id,
    },
    pages: {
      signIn: '/login',
    },
  }
);

export const config = {
  matcher: [
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
