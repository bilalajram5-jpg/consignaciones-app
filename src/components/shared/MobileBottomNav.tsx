'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function MobileBottomNav({
  items,
}: {
  items: Array<{ href: string; label: string; icon: ReactNode }>;
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
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
