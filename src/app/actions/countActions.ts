'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/auth/session';
import * as countService from '@/services/countService';
import * as cutService from '@/services/cutService';
import type { CountEntryMode } from '@/domain/inventory/reconcileInventoryCount';
import { type ActionResult, toErrorMessage } from './shared';

export async function startInventoryCountAction(customerId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser('inventory.count');
    const draft = await countService.getOrCreateDraftCount(customerId, user.id);
    return { success: true, data: { id: draft.id } };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

export interface SaveCountItemPayload {
  inventoryCountId: string;
  productId: string;
  entryMode: CountEntryMode;
  countedQty?: number;
  soldQty?: number;
}

export async function saveCountItemAction(
  payload: SaveCountItemPayload
): Promise<ActionResult<{ soldQty: number; newQty: number; lineAmount: string; hasDiscrepancy: boolean }>> {
  try {
    await requireUser('inventory.count');
    const { item, hasDiscrepancy } = await countService.saveCountItem(payload);
    return {
      success: true,
      data: {
        soldQty: Number(item.soldQty),
        newQty: Number(item.newQty),
        lineAmount: item.lineAmount.toString(),
        hasDiscrepancy,
      },
    };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

export async function getCountSummaryAction(inventoryCountId: string): Promise<
  ActionResult<Awaited<ReturnType<typeof countService.getCountSummary>>>
> {
  try {
    await requireUser('inventory.count');
    const summary = await countService.getCountSummary(inventoryCountId);
    return { success: true, data: summary };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

export async function confirmInventoryCutAction(
  inventoryCountId: string
): Promise<ActionResult<{ cutNumber: number; totalAmount: string }>> {
  try {
    const user = await requireUser('inventory.count');
    const { cut } = await cutService.confirmInventoryCut(inventoryCountId, user.id);
    revalidatePath(`/clientes/${cut.customerId}`);
    revalidatePath('/cuentas-por-cobrar');
    return { success: true, data: { cutNumber: cut.cutNumber, totalAmount: cut.totalAmount.toString() } };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}
