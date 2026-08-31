import type { Metadata } from 'next';
import './globals.css';
import { AuthSessionProvider } from '@/components/shared/AuthSessionProvider';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'Consignaciones',
  description: 'Sistema de gestión de consignaciones',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <Toaster />
      </body>
    </html>
  );
}
