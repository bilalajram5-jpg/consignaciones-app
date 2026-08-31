'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { globalSearchAction } from '@/app/actions/searchActions';

type SearchResults = Awaited<ReturnType<typeof globalSearchAction>>;

export function GlobalSearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const r = await globalSearchAction(value);
      setResults(r);
      setOpen(true);
    });
  }

  const hasResults =
    results && (results.customers.length || results.products.length || results.invoices.length || results.cuts.length);

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar cliente, referencia, factura, corte..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => query.length >= 2 && setOpen(true)}
        />
      </div>
      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-96 overflow-y-auto">
          {isPending && <p className="p-3 text-sm text-muted-foreground">Buscando...</p>}
          {!isPending && !hasResults && <p className="p-3 text-sm text-muted-foreground">Sin resultados.</p>}
          {!isPending && results && (
            <div className="divide-y">
              {results.customers.length > 0 && (
                <ResultSection title="Clientes">
                  {results.customers.map((c) => (
                    <ResultItem key={c.id} onClick={() => go(`/clientes/${c.id}`)} label={c.tradeName} sub={c.code} />
                  ))}
                </ResultSection>
              )}
              {results.products.length > 0 && (
                <ResultSection title="Productos">
                  {results.products.map((p) => (
                    <ResultItem key={p.id} onClick={() => go(`/productos?sku=${p.sku}`)} label={`${p.sku} · ${p.name}`} sub={`$${p.standardPrice}`} />
                  ))}
                </ResultSection>
              )}
              {results.invoices.length > 0 && (
                <ResultSection title="Facturas">
                  {results.invoices.map((i) => (
                    <ResultItem
                      key={i.id}
                      onClick={() => go(`/clientes/${i.customerId}/facturas/${i.id}`)}
                      label={`Factura ${i.invoiceNumber}`}
                      sub={i.customer.tradeName}
                    />
                  ))}
                </ResultSection>
              )}
              {results.cuts.length > 0 && (
                <ResultSection title="Cortes">
                  {results.cuts.map((c) => (
                    <ResultItem
                      key={c.id}
                      onClick={() => go(`/clientes/${c.customerId}`)}
                      label={`Corte #${String(c.cutNumber).padStart(5, '0')}`}
                      sub={c.customer.tradeName}
                    />
                  ))}
                </ResultSection>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-2">
      <p className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function ResultItem({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left px-2 py-2 rounded-md hover:bg-accent flex justify-between items-center text-sm">
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground text-xs">{sub}</span>
    </button>
  );
}
