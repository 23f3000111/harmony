import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { addDays, forecastItem, spendCategoryForItem, todayIn, type ItemDTO, type RestockDTO, type UsageMovement } from '@harmony/shared';
import type { DB } from '../db/types';
import { expenses, items, members, purchaseOrderLines, purchaseOrders, restockEntries, stockMovements, suppliers, type ItemRow, type RestockRow, type WorkspaceRow } from '../db/schema';

const USAGE_WINDOW_DAYS = 60;

/** Every item with its forecast, worked out from real usage over the last two months. */
export async function loadItems(db: DB, workspace: WorkspaceRow, today: string, now: Date, horizonDays = 30, onlyIds?: string[]): Promise<ItemDTO[]> {
  const conditions = [eq(items.workspaceId, workspace.id), isNull(items.archivedAt)];
  if (onlyIds) conditions.push(inArray(items.id, onlyIds));

  const rows = await db
    .select({ item: items, supplierName: suppliers.name, leadTimeDays: suppliers.leadTimeDays })
    .from(items)
    .leftJoin(suppliers, eq(items.supplierId, suppliers.id))
    .where(and(...conditions))
    .orderBy(asc(items.name));

  const since = new Date(now.getTime() - (USAGE_WINDOW_DAYS + 1) * 86_400_000);
  const moves = await db
    .select({ itemId: stockMovements.itemId, delta: stockMovements.delta, reason: stockMovements.reason, createdAt: stockMovements.createdAt })
    .from(stockMovements)
    .where(and(eq(stockMovements.workspaceId, workspace.id), gte(stockMovements.createdAt, since)));

  const byItem = new Map<string, UsageMovement[]>();
  for (const move of moves) {
    const list = byItem.get(move.itemId) ?? [];
    list.push({ delta: move.delta, reason: move.reason, on: todayIn(workspace.timezone, move.createdAt) });
    byItem.set(move.itemId, list);
  }

  const open = await db
    .select({ itemId: restockEntries.itemId })
    .from(restockEntries)
    .where(and(eq(restockEntries.workspaceId, workspace.id), eq(restockEntries.status, 'needed')));
  const onList = new Set(open.map((entry) => entry.itemId));

  const incoming = await db
    .select({ itemId: purchaseOrderLines.itemId, qty: sql<number>`sum(${purchaseOrderLines.qty} - ${purchaseOrderLines.receivedQty})` })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrderLines.orderId, purchaseOrders.id))
    .where(and(eq(purchaseOrders.workspaceId, workspace.id), inArray(purchaseOrders.status, ['sent', 'partial']), sql`${purchaseOrderLines.itemId} is not null`))
    .groupBy(purchaseOrderLines.itemId);
  const onOrder = new Map(incoming.map((row) => [row.itemId, Math.max(0, Number(row.qty))]));

  return rows.map(({ item, supplierName, leadTimeDays }) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    unit: item.unit,
    location: item.location,
    quantity: item.quantity,
    minQty: item.minQty,
    targetQty: item.targetQty,
    unitCostCents: item.unitCostCents,
    supplierId: item.supplierId,
    supplierName,
    expiresOn: item.expiresOn,
    notes: item.notes,
    onList: onList.has(item.id),
    onOrder: onOrder.get(item.id) ?? 0,
    forecast: forecastItem(
      { quantity: item.quantity, minQty: item.minQty, targetQty: item.targetQty, unitCostCents: item.unitCostCents, leadTimeDays, onOrder: onOrder.get(item.id) ?? 0 },
      byItem.get(item.id) ?? [],
      today,
      horizonDays,
    ),
  }));
}

const isLow = (item: ItemRow) => item.minQty > 0 && item.quantity <= item.minQty;

/** The list fills itself: low items join it, and items that recover leave it again if nobody added them by hand. */
export async function syncRestock(db: DB, item: ItemRow, memberId: string | null) {
  const [open] = await db
    .select()
    .from(restockEntries)
    .where(and(eq(restockEntries.itemId, item.id), eq(restockEntries.status, 'needed')))
    .limit(1);

  if (isLow(item) && !open && !item.archivedAt) {
    const quantity = Math.max(1, Math.ceil((item.targetQty ?? item.minQty * 2) - item.quantity));
    await db
      .insert(restockEntries)
      .values({
        workspaceId: item.workspaceId,
        itemId: item.id,
        name: item.name,
        quantity,
        unit: item.unit,
        estCostCents: Math.round(quantity * item.unitCostCents),
        source: 'auto',
        addedById: memberId,
      })
      .onConflictDoNothing();
  } else if (open && open.source === 'auto' && (!isLow(item) || item.archivedAt)) {
    await db.update(restockEntries).set({ status: 'removed', updatedAt: new Date() }).where(eq(restockEntries.id, open.id));
  }
}

/** Changes stock, never below zero, and logs the real change so forecasts stay honest. */
export async function changeStock(
  db: DB,
  item: ItemRow,
  change: { delta: number; reason: string; memberId: string | null; note?: string | null },
): Promise<ItemRow> {
  const nextQuantity = Math.max(0, Math.round((item.quantity + change.delta) * 1000) / 1000);
  const applied = Math.round((nextQuantity - item.quantity) * 1000) / 1000;
  const [updated] = await db.update(items).set({ quantity: nextQuantity, updatedAt: new Date() }).where(eq(items.id, item.id)).returning();
  if (applied !== 0) {
    await db.insert(stockMovements).values({
      workspaceId: item.workspaceId,
      itemId: item.id,
      delta: applied,
      reason: change.reason,
      memberId: change.memberId,
      note: change.note ?? null,
    });
  }
  await syncRestock(db, updated!, change.memberId);
  return updated!;
}

export async function markBought(
  db: DB,
  workspace: WorkspaceRow,
  entry: RestockRow,
  actorId: string | null,
  input: { actualCostCents?: number | null; quantity?: number | null },
  today: string,
  now: Date,
): Promise<RestockRow> {
  if (entry.status !== 'needed') return entry;
  return db.transaction(async (raw) => {
    const tx = raw as unknown as DB;
    const quantity = input.quantity ?? entry.quantity;
    const scaledEstimate = entry.quantity > 0 ? Math.round((entry.estCostCents * quantity) / entry.quantity) : entry.estCostCents;
    const cost = input.actualCostCents ?? scaledEstimate;

    const [updated] = await tx
      .update(restockEntries)
      .set({ status: 'bought', boughtById: actorId, boughtAt: now, actualCostCents: cost, quantity, updatedAt: now })
      .where(eq(restockEntries.id, entry.id))
      .returning();

    let category: string | null = null;
    if (entry.itemId) {
      const [item] = await tx.select().from(items).where(eq(items.id, entry.itemId)).limit(1);
      if (item) {
        category = item.category;
        await changeStock(tx, item, { delta: quantity, reason: 'restocked', memberId: actorId });
      }
    }
    if (cost > 0) {
      await tx.insert(expenses).values({
        workspaceId: workspace.id,
        title: entry.name,
        category: spendCategoryForItem(workspace.edition, category),
        amountCents: cost,
        spentOn: today,
        source: 'restock',
        sourceId: entry.id,
        memberId: actorId,
      });
    }
    return updated!;
  });
}

/** Undo "bought": takes the stock back out and removes the expense it created. */
export async function undoBought(db: DB, entry: RestockRow, actorId: string | null, now: Date): Promise<RestockRow> {
  if (entry.status !== 'bought') return entry;
  return db.transaction(async (raw) => {
    const tx = raw as unknown as DB;
    await tx.delete(expenses).where(and(eq(expenses.sourceId, entry.id), eq(expenses.source, 'restock')));
    if (entry.itemId) {
      await tx
        .update(restockEntries)
        .set({ status: 'removed', updatedAt: now })
        .where(and(eq(restockEntries.itemId, entry.itemId), eq(restockEntries.status, 'needed')));
    }
    const [updated] = await tx
      .update(restockEntries)
      .set({ status: 'needed', boughtById: null, boughtAt: null, actualCostCents: null, updatedAt: now })
      .where(eq(restockEntries.id, entry.id))
      .returning();
    if (entry.itemId) {
      const [item] = await tx.select().from(items).where(eq(items.id, entry.itemId)).limit(1);
      if (item) await changeStock(tx, item, { delta: -entry.quantity, reason: 'adjusted', memberId: actorId, note: 'Undid a purchase' });
    }
    return updated!;
  });
}

export async function loadRestock(db: DB, workspaceId: string, today: string, timezone: string, options: { includeDoneDays?: number } = {}): Promise<RestockDTO[]> {
  const rows = await db
    .select({ entry: restockEntries, category: items.category, addedByName: members.name })
    .from(restockEntries)
    .leftJoin(items, eq(restockEntries.itemId, items.id))
    .leftJoin(members, eq(restockEntries.addedById, members.id))
    .where(and(eq(restockEntries.workspaceId, workspaceId), sql`${restockEntries.status} <> 'removed'`))
    .orderBy(asc(restockEntries.status), desc(restockEntries.updatedAt));

  const memberRows = await db.select({ id: members.id, name: members.name }).from(members).where(eq(members.workspaceId, workspaceId));
  const names = new Map(memberRows.map((member) => [member.id, member.name]));
  const keepFrom = addDays(today, -(options.includeDoneDays ?? 2));

  return rows
    .filter(({ entry }) => entry.status === 'needed' || (entry.boughtAt && todayIn(timezone, entry.boughtAt) >= keepFrom))
    .map(({ entry, category, addedByName }) => ({
      id: entry.id,
      itemId: entry.itemId,
      name: entry.name,
      quantity: entry.quantity,
      unit: entry.unit,
      estCostCents: entry.estCostCents,
      status: entry.status,
      source: entry.source,
      category,
      addedByName,
      boughtByName: entry.boughtById ? (names.get(entry.boughtById) ?? null) : null,
      boughtAt: entry.boughtAt?.toISOString() ?? null,
      actualCostCents: entry.actualCostCents,
    }));
}
