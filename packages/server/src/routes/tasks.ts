import { and, asc, desc, eq, ilike, inArray, lt, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { anchorDayOf, canManage, taskInput, taskUpdate } from '@harmony/shared';
import { announceFrom, idParam, readBody, type AppDeps, type AppEnv, type Ctx } from '../context';
import { tasks, type TaskRow } from '../db/schema';
import { forbidden, notFound } from '../errors';
import { byPriority, finishTask, reopenTask, taskDTO } from '../services/tasks';

/** Everyone sees every task. People can act on tasks that are theirs or unclaimed; managers can act on all of them. */
function assertCanAct(c: Ctx, task: TaskRow) {
  const me = c.get('member');
  if (canManage(me.role) || task.assigneeId === me.id || task.createdById === me.id || task.assigneeId === null) return;
  throw forbidden('This task belongs to someone else.');
}

export const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

export function taskRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  const load = async (c: Ctx) => {
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, idParam(c)), eq(tasks.workspaceId, c.get('workspace').id)))
      .limit(1);
    if (!task) throw notFound('That task');
    return task;
  };

  r.get('/', async (c) => {
    const workspaceId = c.get('workspace').id;
    const today = c.get('today');
    const view = c.req.query('view') ?? 'open';
    const conditions = [eq(tasks.workspaceId, workspaceId)];

    const assignee = c.req.query('assignee');
    if (assignee === 'none') conditions.push(sql`${tasks.assigneeId} is null`);
    else if (assignee) conditions.push(eq(tasks.assigneeId, assignee));

    const q = c.req.query('q')?.trim();
    if (q) conditions.push(ilike(tasks.title, `%${escapeLike(q)}%`));

    const area = c.req.query('area');
    if (area) conditions.push(eq(tasks.area, area));

    const openStatuses = inArray(tasks.status, ['todo', 'doing']);
    let order = [sql`${tasks.dueOn} asc nulls last`, byPriority, asc(tasks.createdAt)];

    if (view === 'open') conditions.push(openStatuses);
    if (view === 'today') conditions.push(openStatuses, lte(tasks.dueOn, today));
    if (view === 'overdue') conditions.push(openStatuses, lt(tasks.dueOn, today));
    if (view === 'done') {
      conditions.push(inArray(tasks.status, ['done', 'skipped']));
      order = [desc(sql`coalesce(${tasks.completedAt}, ${tasks.updatedAt})`)];
    }
    if (view === 'recurring') conditions.push(openStatuses, sql`${tasks.recurrence} <> 'none'`);

    const limit = Math.min(Number(c.req.query('limit')) || 200, 500);
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
    const rows = await db.select().from(tasks).where(and(...conditions)).orderBy(...order).limit(limit + 1).offset(offset);
    return c.json({ tasks: rows.slice(0, limit).map(taskDTO), hasMore: rows.length > limit });
  });

  r.post('/', async (c) => {
    const input = await readBody(c, taskInput);
    const me = c.get('member');
    if (!canManage(me.role) && input.assigneeId && input.assigneeId !== me.id) throw forbidden('Only managers can give tasks to other people.');
    const [task] = await db
      .insert(tasks)
      .values({
        ...input,
        workspaceId: c.get('workspace').id,
        createdById: me.id,
        anchorDay: anchorDayOf(input.dueOn),
      })
      .returning();
    await announceFrom(deps, c as Ctx, { scopes: ['tasks', 'members'], summary: `added “${task!.title}”`, objectType: 'task', objectId: task!.id });
    return c.json({ task: taskDTO(task!) }, 201);
  });

  r.get('/:id', async (c) => c.json({ task: taskDTO(await load(c as Ctx)) }));

  r.patch('/:id', async (c) => {
    const task = await load(c as Ctx);
    assertCanAct(c as Ctx, task);
    const input = await readBody(c, taskUpdate);
    const me = c.get('member');
    if (!canManage(me.role) && input.assigneeId && input.assigneeId !== me.id && input.assigneeId !== task.assigneeId) {
      throw forbidden('Only managers can give tasks to other people.');
    }
    const changes = { ...input, updatedAt: deps.now(), ...(input.dueOn !== undefined ? { anchorDay: anchorDayOf(input.dueOn) } : {}) };
    const [updated] = await db.update(tasks).set(changes).where(eq(tasks.id, task.id)).returning();
    await announceFrom(deps, c as Ctx, { scopes: ['tasks', 'members'] });
    return c.json({ task: taskDTO(updated!) });
  });

  r.post('/:id/complete', async (c) => {
    const task = await load(c as Ctx);
    assertCanAct(c as Ctx, task);
    const updated = await finishTask(db, task, 'done', c.get('member').id, c.get('today'), deps.now());
    if (updated !== task) {
      await announceFrom(deps, c as Ctx, { scopes: ['tasks', 'members'], summary: `finished “${task.title}”`, objectType: 'task', objectId: task.id });
    }
    return c.json({ task: taskDTO(updated) });
  });

  r.post('/:id/skip', async (c) => {
    const task = await load(c as Ctx);
    assertCanAct(c as Ctx, task);
    const updated = await finishTask(db, task, 'skipped', c.get('member').id, c.get('today'), deps.now());
    if (updated !== task) {
      await announceFrom(deps, c as Ctx, { scopes: ['tasks', 'members'], summary: `skipped “${task.title}”`, objectType: 'task', objectId: task.id });
    }
    return c.json({ task: taskDTO(updated) });
  });

  r.post('/:id/reopen', async (c) => {
    const task = await load(c as Ctx);
    assertCanAct(c as Ctx, task);
    const updated = await reopenTask(db, task, deps.now());
    await announceFrom(deps, c as Ctx, { scopes: ['tasks', 'members'], summary: `reopened “${task.title}”`, objectType: 'task', objectId: task.id });
    return c.json({ task: taskDTO(updated) });
  });

  r.delete('/:id', async (c) => {
    const task = await load(c as Ctx);
    assertCanAct(c as Ctx, task);
    await db.delete(tasks).where(eq(tasks.id, task.id));
    await announceFrom(deps, c as Ctx, { scopes: ['tasks', 'members'], summary: `deleted “${task.title}”`, objectType: 'task' });
    return c.json({ ok: true });
  });

  return r;
}
