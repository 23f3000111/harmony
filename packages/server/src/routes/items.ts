import { and, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { adjustInput, boughtInput, itemInput, itemUpdate, restockInput, restockUpdate, type MovementDTO } from '@harmony/shared';
import { announceFrom, idParam, needManager, readBody, type AppDeps, type AppEnv, type Ctx } from '../context';
import type { DB } from '../db/types';
import { items, members, restockEntries, stockMovements, suppliers } from '../db/schema';
import { conflict, notFound } from '../errors';
import { changeStock, loadItems, loadRestock, markBought, syncRestock, undoBought } from '../services/stock';

export function itemRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  const load = async (c: Ctx) => {
    const [item] = await db
      .select()
      .from(items)
      .where(and(eq(items.id, idParam(c)), eq(items.workspaceId, c.get('workspace').id), sql`${items.archivedAt} is null`))
      .limit(1);
    if (!item) throw notFound('That item');
    return item;
  };

  const assertSupplier = async (c: Ctx, supplierId: string | null | undefined) => {
    if (!supplierId) return;
    const [supplier] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, supplierId), eq(suppliers.workspaceId, c.get('workspace').id)))
      .limit(1);
    if (!supplier) throw notFound('That supplier');
  };

  r.get('/', async (c) => {
    const list = await loadItems(db, c.get('workspace'), c.get('today'), deps.now());
    return c.json({ items: list });
  });

  r.post('/', async (c) => {
    needManager(c as Ctx);
    const input = await readBody(c, itemInput);
    await assertSupplier(c as Ctx, input.supplierId);
    const memberId = c.get('member').id;
    const [item] = await db.insert(items).values({ ...input, workspaceId: c.get('workspace').id }).returning();
    await syncRestock(db, item!, memberId);
    await announceFrom(deps, c as Ctx, { scopes: ['items', 'restock'], summary: `added ${item!.name}`, objectType: 'item', objectId: item!.id });
    return c.json({ id: item!.id }, 201);
  });

  r.patch('/:id', async (c) => {
    needManager(c as Ctx);
    const item = await load(c as Ctx);
    const input = await readBody(c, itemUpdate);
    await assertSupplier(c as Ctx, input.supplierId);
    const memberId = c.get('member').id;
    const { quantity, ...rest } = input;
    const [updated] = await db.update(items).set({ ...rest, updatedAt: deps.now() }).where(eq(items.id, item.id)).returning();
    // A typed-in quantity is a stock correction, so it's logged but doesn't count as usage.
    if (quantity !== undefined && quantity !== item.quantity) {
      await changeStock(db, updated!, { delta: quantity - item.quantity, reason: 'adjusted', memberId, note: 'Corrected by hand' });
    } else {
      await syncRestock(db, updated!, memberId);
    }
    await announceFrom(deps, c as Ctx, { scopes: ['items', 'restock'] });
    return c.json({ ok: true });
  });

  r.delete('/:id', async (c) => {
    needManager(c as Ctx);
    const item = await load(c as Ctx);
    const memberId = c.get('member').id;
    const [archived] = await db.update(items).set({ archivedAt: deps.now() }).where(eq(items.id, item.id)).returning();
    await syncRestock(db, archived!, memberId);
    await announceFrom(deps, c as Ctx, { scopes: ['items', 'restock'], summary: `removed ${item.name}`, objectType: 'item' });
    return c.json({ ok: true });
  });

  /** Anyone can record what they used or topped up. */
  r.post('/:id/adjust', async (c) => {
    const item = await load(c as Ctx);
    const input = await readBody(c, adjustInput);
    const me = c.get('member');
    const updated = await db.transaction(async (tx) =>
      changeStock(tx as unknown as DB, item, { delta: input.delta, reason: input.reason, memberId: me.id, note: input.note }),
    );
    const verb = input.delta < 0 ? 'used' : 'added';
    await announceFrom(deps, c as Ctx, {
      scopes: ['items', 'restock'],
      summary: `${verb} ${Math.abs(input.delta)} ${item.unit} of ${item.name}`,
      objectType: 'item',
      objectId: item.id,
    });
    return c.json({ quantity: updated.quantity });
  });

  r.get('/:id/movements', async (c) => {
    const item = await load(c as Ctx);
    const rows = await db
      .select({ movement: stockMovements, memberName: members.name })
      .from(stockMovements)
      .leftJoin(members, eq(stockMovements.memberId, members.id))
      .where(eq(stockMovements.itemId, item.id))
      .orderBy(desc(stockMovements.createdAt))
      .limit(30);
    const movements: MovementDTO[] = rows.map(({ movement, memberName }) => ({
      id: movement.id,
      itemId: movement.itemId,
      delta: movement.delta,
      reason: movement.reason,
      note: movement.note,
      memberName,
      createdAt: movement.createdAt.toISOString(),
    }));
    return c.json({ movements });
  });

  return r;
}

export function restockRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  const load = async (c: Ctx) => {
    const [entry] = await db
      .select()
      .from(restockEntries)
      .where(and(eq(restockEntries.id, idParam(c)), eq(restockEntries.workspaceId, c.get('workspace').id)))
      .limit(1);
    if (!entry) throw notFound('That list entry');
    return entry;
  };

  r.get('/', async (c) => {
    const workspace = c.get('workspace');
    return c.json({ entries: await loadRestock(db, workspace.id, c.get('today'), workspace.timezone) });
  });

  r.post('/', async (c) => {
    const input = await readBody(c, restockInput);
    const workspaceId = c.get('workspace').id;
    let { unit, estCostCents } = input;
    if (input.itemId) {
      const [item] = await db.select().from(items).where(and(eq(items.id, input.itemId), eq(items.workspaceId, workspaceId))).limit(1);
      if (!item) throw notFound('That item');
      const [open] = await db
        .select({ id: restockEntries.id })
        .from(restockEntries)
        .where(and(eq(restockEntries.itemId, item.id), eq(restockEntries.status, 'needed')))
        .limit(1);
      if (open) throw conflict(`${item.name} is already on the list.`);
      unit ??= item.unit;
      if (!estCostCents) estCostCents = Math.round(input.quantity * item.unitCostCents);
    }
    const [entry] = await db
      .insert(restockEntries)
      .values({
        workspaceId,
        itemId: input.itemId ?? null,
        name: input.name,
        quantity: input.quantity,
        unit,
        estCostCents,
        source: 'manual',
        addedById: c.get('member').id,
      })
      .returning();
    await announceFrom(deps, c as Ctx, { scopes: ['restock', 'items'], summary: `added ${entry!.name} to the list`, objectType: 'restock', objectId: entry!.id });
    return c.json({ id: entry!.id }, 201);
  });

  /** Adds everything currently low or forecast to run out. */
  r.post('/from-forecast', async (c) => {
    needManager(c as Ctx);
    const workspace = c.get('workspace');
    const horizon = Math.min(Math.max(Number(c.req.query('days')) || 30, 1), 120);
    const list = await loadItems(db, workspace, c.get('today'), deps.now(), horizon);
    const wanted = list.filter((item) => !item.onList && item.forecast.suggestedQty > 0);
    if (wanted.length > 0) {
      await db
        .insert(restockEntries)
        .values(
          wanted.map((item) => ({
            workspaceId: workspace.id,
            itemId: item.id,
            name: item.name,
            quantity: item.forecast.suggestedQty,
            unit: item.unit,
            estCostCents: item.forecast.suggestedCostCents,
            source: 'auto' as const,
            addedById: c.get('member').id,
          })),
        )
        .onConflictDoNothing();
      await announceFrom(deps, c as Ctx, {
        scopes: ['restock', 'items'],
        summary: `added ${wanted.length} item${wanted.length === 1 ? '' : 's'} from the forecast to the list`,
        objectType: 'restock',
      });
    }
    return c.json({ added: wanted.length });
  });

  r.patch('/:id', async (c) => {
    const entry = await load(c as Ctx);
    const input = await readBody(c, restockUpdate);
    const { itemId: _ignored, ...changes } = input;
    await db.update(restockEntries).set({ ...changes, source: entry.source === 'auto' ? 'manual' : entry.source, updatedAt: deps.now() }).where(eq(restockEntries.id, entry.id));
    await announceFrom(deps, c as Ctx, { scopes: ['restock'] });
    return c.json({ ok: true });
  });

  r.post('/:id/bought', async (c) => {
    const entry = await load(c as Ctx);
    const input = await readBody(c, boughtInput);
    const updated = await markBought(db, c.get('workspace'), entry, c.get('member').id, input, c.get('today'), deps.now());
    if (updated !== entry) {
      await announceFrom(deps, c as Ctx, { scopes: ['restock', 'items', 'money'], summary: `bought ${entry.name}`, objectType: 'restock', objectId: entry.id });
    }
    return c.json({ ok: true });
  });

  r.post('/:id/undo', async (c) => {
    const entry = await load(c as Ctx);
    await undoBought(db, entry, c.get('member').id, deps.now());
    await announceFrom(deps, c as Ctx, { scopes: ['restock', 'items', 'money'], summary: `put ${entry.name} back on the list`, objectType: 'restock', objectId: entry.id });
    return c.json({ ok: true });
  });

  r.delete('/:id', async (c) => {
    const entry = await load(c as Ctx);
    await db.update(restockEntries).set({ status: 'removed', updatedAt: deps.now() }).where(eq(restockEntries.id, entry.id));
    await announceFrom(deps, c as Ctx, { scopes: ['restock', 'items'] });
    return c.json({ ok: true });
  });

  return r;
}
