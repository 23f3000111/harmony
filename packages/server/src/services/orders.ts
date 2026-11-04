import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { spendCategoryForItem, type OrderDTO } from '@harmony/shared';
import type { DB } from '../db/types';
import { expenses, items, members, purchaseOrderLines, purchaseOrders, requests, suppliers, workspaces, type OrderRow, type WorkspaceRow } from '../db/schema';
import { conflict } from '../errors';
import { changeStock } from './stock';

export const orderNumber = (number: number) => `PO-${String(number).padStart(4, '0')}`;

export async function loadOrders(db: DB, workspaceId: string, filter: { id?: string; statuses?: OrderRow['status'][] } = {}): Promise<OrderDTO[]> {
  const conditions = [eq(purchaseOrders.workspaceId, workspaceId)];
  if (filter.id) conditions.push(eq(purchaseOrders.id, filter.id));
  if (filter.statuses) conditions.push(inArray(purchaseOrders.status, filter.statuses));

  const rows = await db
    .select({ order: purchaseOrders, supplierName: suppliers.name, createdByName: members.name })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .leftJoin(members, eq(purchaseOrders.createdById, members.id))
    .where(and(...conditions))
    .orderBy(desc(purchaseOrders.number));
  if (rows.length === 0) return [];

  const lines = await db
    .select()
    .from(purchaseOrderLines)
    .where(inArray(purchaseOrderLines.orderId, rows.map((row) => row.order.id)))
    .orderBy(asc(purchaseOrderLines.description));
  const byOrder = new Map<string, typeof lines>();
  for (const line of lines) byOrder.set(line.orderId, [...(byOrder.get(line.orderId) ?? []), line]);

  return rows.map(({ order, supplierName, createdByName }) => {
    const orderLines = byOrder.get(order.id) ?? [];
    return {
      id: order.id,
      number: orderNumber(order.number),
      supplierId: order.supplierId,
      supplierName,
      status: order.status,
      orderedOn: order.orderedOn,
      expectedOn: order.expectedOn,
      receivedOn: order.receivedOn,
      notes: order.notes,
      requestId: order.requestId,
      createdByName,
      createdAt: order.createdAt.toISOString(),
      totalCents: Math.round(orderLines.reduce((sum, line) => sum + line.qty * line.unitCostCents, 0)),
      receivedCents: Math.round(orderLines.reduce((sum, line) => sum + line.receivedQty * line.unitCostCents, 0)),
      lines: orderLines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        description: line.description,
        qty: line.qty,
        unit: line.unit,
        unitCostCents: line.unitCostCents,
        receivedQty: line.receivedQty,
      })),
    };
  });
}

export interface NewOrder {
  supplierId: string;
  expectedOn?: string | null;
  notes?: string | null;
  requestId?: string | null;
  lines: { itemId?: string | null; description: string; qty: number; unit?: string | null; unitCostCents: number }[];
}

export async function createOrder(db: DB, workspace: WorkspaceRow, input: NewOrder, actorId: string | null): Promise<string> {
  return db.transaction(async (tx) => {
    // Taking the number inside the transaction keeps PO numbers unique under concurrent requests.
    const [sequence] = await tx
      .update(workspaces)
      .set({ orderSeq: sql`${workspaces.orderSeq} + 1` })
      .where(eq(workspaces.id, workspace.id))
      .returning({ orderSeq: workspaces.orderSeq });

    const [order] = await tx
      .insert(purchaseOrders)
      .values({
        workspaceId: workspace.id,
        number: sequence!.orderSeq,
        supplierId: input.supplierId,
        expectedOn: input.expectedOn ?? null,
        notes: input.notes ?? null,
        requestId: input.requestId ?? null,
        createdById: actorId,
      })
      .returning({ id: purchaseOrders.id });

    await tx.insert(purchaseOrderLines).values(
      input.lines.map((line) => ({
        orderId: order!.id,
        itemId: line.itemId ?? null,
        description: line.description,
        qty: line.qty,
        unit: line.unit ?? null,
        unitCostCents: line.unitCostCents,
      })),
    );

    if (input.requestId) {
      await tx
        .update(requests)
        .set({ status: 'ordered', orderId: order!.id, updatedAt: new Date() })
        .where(and(eq(requests.id, input.requestId), eq(requests.workspaceId, workspace.id)));
    }
    return order!.id;
  });
}

/** Goods arriving: stock goes up, the money counts as spent, and the order closes once everything is in. */
export async function receiveOrder(
  db: DB,
  workspace: WorkspaceRow,
  order: OrderRow,
  received: { lineId: string; qty: number }[],
  actorId: string | null,
  today: string,
): Promise<void> {
  if (order.status !== 'sent' && order.status !== 'partial') throw conflict('Only orders that have been sent can be received.');

  await db.transaction(async (raw) => {
    const tx = raw as unknown as DB;
    const lines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.orderId, order.id));
    const spendByCategory = new Map<string, number>();

    for (const entry of received) {
      const line = lines.find((candidate) => candidate.id === entry.lineId);
      if (!line) throw conflict('That line is not on this order.');
      const outstanding = line.qty - line.receivedQty;
      if (entry.qty > outstanding + 1e-9) throw conflict(`Only ${outstanding} of “${line.description}” is still outstanding.`);

      line.receivedQty += entry.qty;
      await tx.update(purchaseOrderLines).set({ receivedQty: line.receivedQty }).where(eq(purchaseOrderLines.id, line.id));

      let category: string | null = null;
      if (line.itemId) {
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId)).limit(1);
        if (item) {
          category = item.category;
          await changeStock(tx, item, { delta: entry.qty, reason: 'received', memberId: actorId, note: orderNumber(order.number) });
        }
      }
      const spendCategory = spendCategoryForItem(workspace.edition, category);
      spendByCategory.set(spendCategory, (spendByCategory.get(spendCategory) ?? 0) + Math.round(entry.qty * line.unitCostCents));
    }

    for (const [category, amountCents] of spendByCategory) {
      if (amountCents <= 0) continue;
      await tx.insert(expenses).values({
        workspaceId: workspace.id,
        title: `${orderNumber(order.number)} goods received`,
        category,
        amountCents,
        spentOn: today,
        source: 'order',
        sourceId: order.id,
        memberId: actorId,
      });
    }

    const complete = lines.every((line) => line.receivedQty >= line.qty - 1e-9);
    await tx
      .update(purchaseOrders)
      .set({ status: complete ? 'received' : 'partial', receivedOn: complete ? today : null, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, order.id));

    if (complete && order.requestId) {
      await tx.update(requests).set({ status: 'done', updatedAt: new Date() }).where(eq(requests.id, order.requestId));
    }
  });
}
