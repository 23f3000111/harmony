import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { addDays, orderInput, orderUpdate, receiveInput, supplierInput, supplierUpdate, type SupplierDTO } from '@harmony/shared';
import { announceFrom, idParam, needFeature, needManager, readBody, type AppDeps, type AppEnv, type Ctx } from '../context';
import { items, purchaseOrderLines, purchaseOrders, requests, suppliers } from '../db/schema';
import { conflict, notFound } from '../errors';
import { createOrder, loadOrders, orderNumber, receiveOrder } from '../services/orders';

export function supplierRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  r.use('*', async (c, next) => {
    needFeature(c as Ctx, 'suppliers');
    await next();
  });

  const load = async (c: Ctx) => {
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, idParam(c)), eq(suppliers.workspaceId, c.get('workspace').id), isNull(suppliers.archivedAt)))
      .limit(1);
    if (!supplier) throw notFound('That supplier');
    return supplier;
  };

  r.get('/', async (c) => {
    const workspaceId = c.get('workspace').id;
    const rows = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.workspaceId, workspaceId), isNull(suppliers.archivedAt)))
      .orderBy(asc(suppliers.name));

    // On-time rate and spend come from real orders, so a new supplier simply shows none yet.
    const spendRows = await db
      .select({
        supplierId: purchaseOrders.supplierId,
        spent: sql<string>`coalesce(sum(${purchaseOrderLines.receivedQty} * ${purchaseOrderLines.unitCostCents}), 0)`,
      })
      .from(purchaseOrders)
      .leftJoin(purchaseOrderLines, eq(purchaseOrderLines.orderId, purchaseOrders.id))
      .where(eq(purchaseOrders.workspaceId, workspaceId))
      .groupBy(purchaseOrders.supplierId);

    const orderCounts = await db
      .select({
        supplierId: purchaseOrders.supplierId,
        received: sql<string>`count(*)`,
        onTime: sql<string>`count(*) filter (where ${purchaseOrders.expectedOn} is not null and ${purchaseOrders.receivedOn} <= ${purchaseOrders.expectedOn})`,
      })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.workspaceId, workspaceId), eq(purchaseOrders.status, 'received')))
      .groupBy(purchaseOrders.supplierId);

    const spend = new Map(spendRows.map((row) => [row.supplierId, Number(row.spent)]));
    const counts = new Map(orderCounts.map((row) => [row.supplierId, row]));
    const list: SupplierDTO[] = rows.map((row) => {
      const count = counts.get(row.id);
      const received = Number(count?.received ?? 0);
      return {
        id: row.id,
        name: row.name,
        contactName: row.contactName,
        email: row.email,
        phone: row.phone,
        category: row.category,
        paymentTermsDays: row.paymentTermsDays,
        leadTimeDays: row.leadTimeDays,
        notes: row.notes,
        ordersReceived: received,
        onTimePercent: received ? Math.round((Number(count!.onTime) / received) * 100) : null,
        spentCents: Math.round(spend.get(row.id) ?? 0),
      };
    });
    return c.json({ suppliers: list });
  });

  r.post('/', async (c) => {
    needManager(c as Ctx);
    const input = await readBody(c, supplierInput);
    const [supplier] = await db.insert(suppliers).values({ ...input, workspaceId: c.get('workspace').id }).returning();
    await announceFrom(deps, c as Ctx, { scopes: ['suppliers'], summary: `added supplier ${supplier!.name}`, objectType: 'supplier', objectId: supplier!.id });
    return c.json({ id: supplier!.id }, 201);
  });

  r.patch('/:id', async (c) => {
    needManager(c as Ctx);
    const supplier = await load(c as Ctx);
    const input = await readBody(c, supplierUpdate);
    await db.update(suppliers).set(input).where(eq(suppliers.id, supplier.id));
    await announceFrom(deps, c as Ctx, { scopes: ['suppliers', 'items'] });
    return c.json({ ok: true });
  });

  r.delete('/:id', async (c) => {
    needManager(c as Ctx);
    const supplier = await load(c as Ctx);
    await db.update(suppliers).set({ archivedAt: deps.now() }).where(eq(suppliers.id, supplier.id));
    await db.update(items).set({ supplierId: null }).where(eq(items.supplierId, supplier.id));
    await announceFrom(deps, c as Ctx, { scopes: ['suppliers', 'items'], summary: `removed supplier ${supplier.name}`, objectType: 'supplier' });
    return c.json({ ok: true });
  });

  return r;
}

export function orderRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  r.use('*', async (c, next) => {
    needFeature(c as Ctx, 'orders');
    needManager(c as Ctx);
    await next();
  });

  const load = async (c: Ctx) => {
    const [order] = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, idParam(c)), eq(purchaseOrders.workspaceId, c.get('workspace').id)))
      .limit(1);
    if (!order) throw notFound('That order');
    return order;
  };

  const assertSupplier = async (c: Ctx, supplierId: string) => {
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, supplierId), eq(suppliers.workspaceId, c.get('workspace').id)))
      .limit(1);
    if (!supplier) throw notFound('That supplier');
    return supplier;
  };

  r.get('/', async (c) => c.json({ orders: await loadOrders(db, c.get('workspace').id) }));

  r.get('/:id', async (c) => {
    const order = await load(c as Ctx);
    const [dto] = await loadOrders(db, order.workspaceId, { id: order.id });
    return c.json({ order: dto });
  });

  r.post('/', async (c) => {
    const input = await readBody(c, orderInput);
    await assertSupplier(c as Ctx, input.supplierId);
    const workspace = c.get('workspace');
    if (input.requestId) {
      const [request] = await db
        .select()
        .from(requests)
        .where(and(eq(requests.id, input.requestId), eq(requests.workspaceId, workspace.id)))
        .limit(1);
      if (!request) throw notFound('That request');
      if (request.status !== 'approved') throw conflict('Only approved requests can become orders.');
    }
    const id = await createOrder(db, workspace, input, c.get('member').id);
    const [dto] = await loadOrders(db, workspace.id, { id });
    await announceFrom(deps, c as Ctx, { scopes: ['orders', 'requests'], summary: `drafted ${dto!.number} for ${dto!.supplierName}`, objectType: 'order', objectId: id });
    return c.json({ order: dto }, 201);
  });

  r.patch('/:id', async (c) => {
    const order = await load(c as Ctx);
    const input = await readBody(c, orderUpdate);
    if (input.lines && order.status !== 'draft') throw conflict('Lines can only change while the order is a draft.');
    await db.transaction(async (tx) => {
      await tx
        .update(purchaseOrders)
        .set({
          ...(input.expectedOn !== undefined ? { expectedOn: input.expectedOn } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          updatedAt: deps.now(),
        })
        .where(eq(purchaseOrders.id, order.id));
      if (input.lines) {
        await tx.delete(purchaseOrderLines).where(eq(purchaseOrderLines.orderId, order.id));
        await tx.insert(purchaseOrderLines).values(input.lines.map((line) => ({ ...line, orderId: order.id })));
      }
    });
    await announceFrom(deps, c as Ctx, { scopes: ['orders'] });
    return c.json({ ok: true });
  });

  r.post('/:id/send', async (c) => {
    const order = await load(c as Ctx);
    if (order.status !== 'draft') throw conflict('Only draft orders can be sent.');
    const supplier = await assertSupplier(c as Ctx, order.supplierId);
    const today = c.get('today');
    await db
      .update(purchaseOrders)
      .set({ status: 'sent', orderedOn: today, expectedOn: order.expectedOn ?? addDays(today, supplier.leadTimeDays), updatedAt: deps.now() })
      .where(eq(purchaseOrders.id, order.id));
    await announceFrom(deps, c as Ctx, { scopes: ['orders'], summary: `sent ${orderNumber(order.number)} to ${supplier.name}`, objectType: 'order', objectId: order.id });
    return c.json({ ok: true });
  });

  r.post('/:id/receive', async (c) => {
    const order = await load(c as Ctx);
    const input = await readBody(c, receiveInput);
    await receiveOrder(db, c.get('workspace'), order, input.lines, c.get('member').id, c.get('today'));
    await announceFrom(deps, c as Ctx, {
      scopes: ['orders', 'items', 'restock', 'money', 'requests', 'suppliers'],
      summary: `received goods for ${orderNumber(order.number)}`,
      objectType: 'order',
      objectId: order.id,
    });
    return c.json({ ok: true });
  });

  r.post('/:id/cancel', async (c) => {
    const order = await load(c as Ctx);
    if (order.status !== 'draft' && order.status !== 'sent') throw conflict('Orders with goods received can no longer be cancelled.');
    await db.transaction(async (tx) => {
      await tx.update(purchaseOrders).set({ status: 'cancelled', updatedAt: deps.now() }).where(eq(purchaseOrders.id, order.id));
      if (order.requestId) {
        await tx.update(requests).set({ status: 'approved', orderId: null, updatedAt: deps.now() }).where(eq(requests.id, order.requestId));
      }
    });
    await announceFrom(deps, c as Ctx, { scopes: ['orders', 'requests'], summary: `cancelled ${orderNumber(order.number)}`, objectType: 'order', objectId: order.id });
    return c.json({ ok: true });
  });

  return r;
}
