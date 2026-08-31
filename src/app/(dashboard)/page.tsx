import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDashboardData } from '@/services/dashboardService';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Package, Wallet, TrendingUp, Banknote, Users, Boxes } from 'lucide-react';

export default async function DashboardPage() {
  const data = await getDashboardData();

  const cards = [
    { label: 'Total en consignación', value: formatCurrency(data.totalConsignmentValue), icon: Package },
    { label: 'Total por cobrar', value: formatCurrency(data.totalReceivable), icon: Wallet },
    { label: 'Ventas del mes', value: formatCurrency(data.salesThisMonth), icon: TrendingUp },
    { label: 'Pagos recibidos (mes)', value: formatCurrency(data.paymentsThisMonth), icon: Banknote },
    { label: 'Clientes activos', value: String(data.activeCustomersCount), icon: Users },
    { label: 'Productos en consignación', value: String(data.productsInConsignmentCount), icon: Boxes },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{c.label}</p>
                  <p className="text-2xl font-semibold mt-1">{c.value}</p>
                </div>
                <c.icon className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Clientes con mayor saldo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.topCustomersByBalance.length === 0 && <p className="text-sm text-muted-foreground">Sin saldos pendientes.</p>}
            {data.topCustomersByBalance.map((c) => (
              <div key={c.customerId} className="flex justify-between text-sm py-1 border-b last:border-0">
                <span>{c.customerName}</span>
                <span className="font-medium">{formatCurrency(c.balance)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Productos más vendidos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.topSellingProducts.length === 0 && <p className="text-sm text-muted-foreground">Sin ventas registradas aún.</p>}
            {data.topSellingProducts.map((p) => (
              <div key={p.productId} className="flex justify-between text-sm py-1 border-b last:border-0">
                <span>{p.sku} · {p.name}</span>
                <span className="font-medium">{p.unitsSold} u.</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimos inventarios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.lastCounts.length === 0 && <p className="text-sm text-muted-foreground">Sin visitas confirmadas aún.</p>}
            {data.lastCounts.map((c) => (
              <div key={c.id} className="flex justify-between text-sm py-1 border-b last:border-0">
                <span>{c.customer.tradeName}</span>
                <span className="text-muted-foreground">{c.confirmedAt ? formatDate(c.confirmedAt) : ''}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimos pagos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.lastPayments.length === 0 && <p className="text-sm text-muted-foreground">Sin pagos registrados aún.</p>}
            {data.lastPayments.map((p) => (
              <div key={p.id} className="flex justify-between text-sm py-1 border-b last:border-0">
                <span>{p.customer.tradeName}</span>
                <span className="font-medium">{formatCurrency(p.amount.toString())}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
