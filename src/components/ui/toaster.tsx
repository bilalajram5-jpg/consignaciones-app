'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Sistema de notificaciones (toast) minimalista, sin dependencias externas
 * (se evitó @radix-ui/react-toast para no sumar otra librería solo para
 * esto). Uso: `const { toast } = useToast(); toast({ title, description, variant })`.
 */

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
}

interface ToastContextValue {
  toast: (msg: Omit<ToastMessage, 'id'>) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

// Se mantiene un registro global simple para poder llamar `toast()` incluso
// fuera de componentes controlados directamente por el Provider (patrón
// común y suficiente para esta app; no requiere una librería de estado global).
let pushToastImpl: ((msg: Omit<ToastMessage, 'id'>) => void) | null = null;

export function toast(msg: Omit<ToastMessage, 'id'>) {
  pushToastImpl?.(msg);
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // Permite usarlo también fuera del árbol del provider (fallback al singleton)
    return { toast };
  }
  return ctx;
}

export function Toaster() {
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);

  React.useEffect(() => {
    pushToastImpl = (msg) => {
      const id = Math.random().toString(36).slice(2);
      setMessages((prev) => [...prev, { ...msg, id }]);
      setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }, 5000);
    };
    return () => {
      pushToastImpl = null;
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm">
      {messages.map((m) => (
        <div
          key={m.id}
          className={cn(
            'rounded-lg border p-4 shadow-lg bg-card text-card-foreground animate-in slide-in-from-bottom-2',
            m.variant === 'destructive' && 'border-destructive bg-destructive text-destructive-foreground',
            m.variant === 'success' && 'border-success bg-success text-success-foreground'
          )}
        >
          <p className="font-medium text-sm">{m.title}</p>
          {m.description && <p className="text-sm opacity-90 mt-1">{m.description}</p>}
        </div>
      ))}
    </div>
  );
}
