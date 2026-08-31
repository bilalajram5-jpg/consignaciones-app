import { notFound } from 'next/navigation';
import { getCustomerById } from '@/services/customerService';
import { getCustomerConsignmentInventory } from '@/services/inventoryService';
import { getOrCreateDraftCount } from '@/services/countService';
import { requireUser } from '@/auth/session';
import { InventoryCountWizard } from '@/components/inventory/InventoryCountWizard';

export default async function InventoryCountPage({ params }: { params: { id: string } }) {
  const customer = await getCustomerById(params.id);
  if (!customer) notFound();

  const user = await requireUser('inventory.count');
  const [inventory, draft] = await Promise.all([
    getCustomerConsignmentInventory(params.id),
    getOrCreateDraftCount(params.id, user.id),
  ]);

  return (
    <InventoryCountWizard
      customerId={customer.id}
      customerName={customer.tradeName}
      inventoryCountId={draft.id}
      products={inventory.map((line) => ({
        productId: line.productId,
        sku: line.sku,
        barcode: line.barcode,
        name: line.productName,
        availableQty: line.availableQty,
        unitPrice: line.referenceUnitPrice,
        batches: line.batches.map((b) => ({ batchId: b.batchId, availableQty: b.availableQty, batchDate: b.batchDate })),
      }))}
      existingItems={draft.items.map((i) => ({
        productId: i.productId,
        entryMode: i.entryMode as 'CONTEO_FISICO' | 'CANTIDAD_VENDIDA',
        countedQty: i.countedQty ? Number(i.countedQty) : undefined,
        soldQty: Number(i.soldQty),
        newQty: Number(i.newQty),
        lineAmount: i.lineAmount.toString(),
        hasDiscrepancy: i.hasDiscrepancy,
      }))}
    />
  );
}
