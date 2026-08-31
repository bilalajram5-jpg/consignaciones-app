import {
  LayoutDashboard,
  Users,
  Package,
  Wallet,
  Banknote,
  FileBarChart,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { NavLink } from '@/components/shared/NavLink';
import { MobileBottomNav } from '@/components/shared/MobileBottomNav';
import { SignOutButton } from '@/components/shared/SignOutButton';
import { GlobalSearchBox } from '@/components/shared/GlobalSearchBox';
import { getCurrentUser } from '@/auth/session';
import { hasPermission } from '@/auth/permissions';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, permission: null as const },
  { href: '/clientes', label: 'Clientes', icon: Users, permission: 'customers.view' as const },
  { href: '/productos', label: 'Productos', icon: Package, permission: 'products.view' as const },
  { href: '/cuentas-por-cobrar', label: 'Cuentas por cobrar', icon: Wallet, permission: 'receivables.view' as const },
  { href: '/pagos', label: 'Pagos', icon: Banknote, permission: 'payments.view' as const },
  { href: '/reportes', label: 'Reportes', icon: FileBarChart, permission: 'reports.export' as const },
  { href: '/auditoria', label: 'Auditoría', icon: ShieldCheck, permission: 'audit.view' as const },
  { href: '/usuarios', label: 'Usuarios', icon: UserCog, permission: 'users.manage' as const },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || hasPermission(user?.role ?? 'VISOR', item.permission));

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:flex w-64 flex-col border-r bg-card p-4 gap-4">
        <div className="px-2">
          <p className="font-bold text-lg">Consignaciones</p>
          {user && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {user.name} · {ROLE_LABELS[user.role]}
            </p>
          )}
        </div>
        <nav className="flex flex-col gap-1">
          {visibleItems.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} icon={<item.icon className="h-4 w-4 shrink-0" />} />
          ))}
        </nav>
        <div className="mt-auto">
          <SignOutButton />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-4 border-b bg-background/95 backdrop-blur px-4 py-3">
          <div className="flex-1 max-w-md">
            <GlobalSearchBox />
          </div>
          <div className="md:hidden">
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>

        {/* Navegación inferior móvil (sección 25: mobile-first) */}
        <MobileBottomNav
          items={visibleItems.slice(0, 5).map((item) => ({
            href: item.href,
            label: item.label,
            icon: <item.icon className="h-5 w-5" />,
          }))}
        />
      </div>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  VENDEDOR: 'Vendedor',
  CONTABILIDAD: 'Contabilidad',
  VISOR: 'Visor',
};
