'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

/**
 * Navegación inferior móvil (sección 25: mobile-first). Antes usaba
 * etiquetas `<a href>` planas, lo que forzaba una recarga completa de
 * página en cada tap (mucho más lento y costoso en datos, justo en el
 * dispositivo/red donde menos conviene — el mismo escenario de conectividad
 * inestable que se endureció en `InventoryCountWizard`) y nunca resaltaba
 * en qué sección estaba parado el usuario. Se extrajo a un componente
 * cliente para poder usar `next/link` (navegación del lado del cliente,
 * sin recarga) y `usePathname` (resaltar la pestaña activa), igual que ya
 * hace `NavLink.tsx` para la barra lateral de escritorio.
 */
export function MobileBottomNav({
  items,
}: {
  items: Array<{ href: string; label: string; icon: LucideIcon }>;
}) {
  const pathname = usePathname();

  return (
    <nav className="md:hidden sticky bottom-0 border-t bg-background flex justify-around py-2 z-20">
      {items.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center gap-0.5 text-xs px-2 py-1 rounded-md transition-colors',
              active ? 'text-primary font-medium' : 'text-muted-foreground'
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
