import { getCustomerById } from '@/services/customerService';
import { notFound } from 'next/navigation';
import { InvoiceUploadWizard } from '@/components/invoices/InvoiceUploadWizard';

export default async function NewInvoicePage({ params }: { params: { id: string } }) {
  const customer = await getCustomerById(params.id);
  if (!customer) notFound();

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div>
        <p className="text-sm text-muted-foreground">{customer.tradeName}</p>
        <h1 className="text-2xl font-semibold">Subir factura de consignación</h1>
      </div>
      <InvoiceUploadWizard customerId={customer.id} />
    </div>
  );
}
