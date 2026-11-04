import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { canManage, decisionInput, requestInput, type RequestDTO } from '@harmony/shared';
import { announceFrom, idParam, needFeature, needManager, readBody, type AppDeps, type AppEnv, type Ctx } from '../context';
import type { DB } from '../db/types';
import { items, members, requests, restockEntries, tasks, type RequestRow } from '../db/schema';
import { conflict, forbidden, notFound } from '../errors';

export async function requestDTOs(db: DB, workspaceId: string, rows: RequestRow[]): Promise<RequestDTO[]> {
  const ids = [...new Set(rows.flatMap((row) => [row.requestedById, row.decidedById]).filter((id): id is string => Boolean(id)))];
  const people = ids.length ? await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.workspaceId, workspaceId), inArray(members.id, ids))) : [];
  const names = new Map(people.map((person) => [person.id, person.name]));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    details: row.details,
    category: row.category,
    neededBy: row.neededBy,
    priority: row.priority,
    status: row.status,
    requestedById: row.requestedById,
    requestedByName: row.requestedById ? (names.get(row.requestedById) ?? null) : null,
    decidedByName: row.decidedById ? (names.get(row.decidedById) ?? null) : null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    lines: row.lines,
    estimatedCents: row.estimatedCents,
    taskId: row.taskId,
    orderId: row.orderId,
    createdAt: row.createdAt.toISOString(),
  }));
}

export function requestRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  r.use('*', async (c, next) => {
    needFeature(c as Ctx, 'requests');
    await next();
  });

  const load = async (c: Ctx) => {
    const [request] = await db
      .select()
      .from(requests)
      .where(and(eq(requests.id, idParam(c)), eq(requests.workspaceId, c.get('workspace').id)))
      .limit(1);
    if (!request) throw notFound('That request');
    const me = c.get('member');
    if (!canManage(me.role) && request.requestedById !== me.id) throw notFound('That request');
    return request;
  };

  r.get('/', async (c) => {
    const workspaceId = c.get('workspace').id;
    const me = c.get('member');
    const conditions = [eq(requests.workspaceId, workspaceId)];
    if (!canManage(me.role)) conditions.push(eq(requests.requestedById, me.id));
    const status = c.req.query('status');
    if (status === 'open') conditions.push(eq(requests.status, 'open'));
    const rows = await db
      .select()
      .from(requests)
      .where(and(...conditions))
      .orderBy(sql`case ${requests.status} when 'open' then 0 when 'approved' then 1 else 2 end`, desc(requests.createdAt))
      .limit(300);
    return c.json({ requests: await requestDTOs(db, workspaceId, rows) });
  });

  r.get('/:id', async (c) => {
    const request = await load(c as Ctx);
    const [dto] = await requestDTOs(db, request.workspaceId, [request]);
    return c.json({ request: dto });
  });

  r.post('/', async (c) => {
    const input = await readBody(c, requestInput);
    const estimatedCents = Math.round(input.lines.reduce((sum, line) => sum + line.qty * line.unitCostCents, 0));
    const [request] = await db
      .insert(requests)
      .values({ ...input, workspaceId: c.get('workspace').id, requestedById: c.get('member').id, estimatedCents })
      .returning();
    await announceFrom(deps, c as Ctx, { scopes: ['requests'], summary: `asked for “${request!.title}”`, objectType: 'request', objectId: request!.id });
    return c.json({ id: request!.id }, 201);
  });

  /** A requester may take back their own request until someone has decided on it. */
  r.delete('/:id', async (c) => {
    const request = await load(c as Ctx);
    if (request.status !== 'open') throw conflict('This request has already been decided.');
    await db.delete(requests).where(eq(requests.id, request.id));
    await announceFrom(deps, c as Ctx, { scopes: ['requests'], summary: `withdrew “${request.title}”`, objectType: 'request' });
    return c.json({ ok: true });
  });

  /**
   * Approving turns a request into work:
   *  People: supplies go on the restock list, anything else becomes a job.
   *  Supply: it waits as approved until someone raises the purchase order.
   */
  r.post('/:id/approve', async (c) => {
    needManager(c as Ctx);
    const request = await load(c as Ctx);
    if (request.status !== 'open') throw conflict('This request has already been decided.');
    const me = c.get('member');
    if (request.requestedById === me.id && me.role !== 'owner') throw forbidden('Someone else needs to approve your own request.');
    const input = await readBody(c, decisionInput);
    const workspace = c.get('workspace');
    const now = deps.now();

    await db.transaction(async (raw) => {
      const tx = raw as unknown as DB;
      let taskId: string | null = null;
      if (workspace.edition === 'people') {
        if (request.kind === 'supply') {
          const lines = request.lines.length ? request.lines : [{ name: request.title, qty: 1, unitCostCents: 0, unit: null, itemId: null }];
          for (const line of lines) {
            const [item] = line.itemId
              ? await tx.select().from(items).where(and(eq(items.id, line.itemId), eq(items.workspaceId, workspace.id))).limit(1)
              : [];
            await tx
              .insert(restockEntries)
              .values({
                workspaceId: workspace.id,
                itemId: item?.id ?? null,
                name: item?.name ?? line.name,
                quantity: line.qty,
                unit: line.unit ?? item?.unit ?? null,
                estCostCents: Math.round(line.qty * (line.unitCostCents || item?.unitCostCents || 0)),
                source: 'request',
                addedById: me.id,
              })
              .onConflictDoNothing();
          }
        } else {
          const [task] = await tx
            .insert(tasks)
            .values({
              workspaceId: workspace.id,
              title: request.title,
              notes: request.details,
              area: request.kind === 'repair' ? 'Facilities' : 'Admin',
              assigneeId: input.assigneeId ?? null,
              createdById: me.id,
              dueOn: request.neededBy,
              priority: request.priority,
            })
            .returning({ id: tasks.id });
          taskId = task!.id;
        }
      }
      await tx
        .update(requests)
        .set({ status: 'approved', decidedById: me.id, decidedAt: now, decisionNote: input.note ?? null, taskId, updatedAt: now })
        .where(eq(requests.id, request.id));
    });

    await announceFrom(deps, c as Ctx, { scopes: ['requests', 'tasks', 'restock', 'members'], summary: `approved “${request.title}”`, objectType: 'request', objectId: request.id });
    return c.json({ ok: true });
  });

  r.post('/:id/reject', async (c) => {
    needManager(c as Ctx);
    const request = await load(c as Ctx);
    if (request.status !== 'open') throw conflict('This request has already been decided.');
    const input = await readBody(c, decisionInput);
    const now = deps.now();
    await db
      .update(requests)
      .set({ status: 'rejected', decidedById: c.get('member').id, decidedAt: now, decisionNote: input.note ?? null, updatedAt: now })
      .where(eq(requests.id, request.id));
    await announceFrom(deps, c as Ctx, { scopes: ['requests'], summary: `declined “${request.title}”`, objectType: 'request', objectId: request.id });
    return c.json({ ok: true });
  });

  r.post('/:id/done', async (c) => {
    needManager(c as Ctx);
    const request = await load(c as Ctx);
    if (request.status !== 'approved') throw conflict('Only approved requests can be closed.');
    await db.update(requests).set({ status: 'done', updatedAt: deps.now() }).where(eq(requests.id, request.id));
    await announceFrom(deps, c as Ctx, { scopes: ['requests'], summary: `closed “${request.title}”`, objectType: 'request', objectId: request.id });
    return c.json({ ok: true });
  });

  return r;
}
