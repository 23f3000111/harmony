import { and, asc, between, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { addDays, boardActorInput, FEATURES, startOfWeek, todayIn, type BoardDTO } from '@harmony/shared';
import { announce, clientIp, idParam, readBody, type AppDeps, type AppEnv } from '../context';
import { events, members, restockEntries, tasks, workspaces, type WorkspaceRow } from '../db/schema';
import { notFound } from '../errors';
import { loadRestock, markBought, undoBought } from '../services/stock';
import { finishTask, reopenTask, taskDTO } from '../services/tasks';
import { eventDTO, loadMeals } from './meals';

/**
 * The wall board: a secret link for a tablet on the fridge or a phone without an account.
 * It can read today's list and tick things off, and nothing else. No money, no settings, no people's details.
 */
export function boardRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  const loadWorkspace = async (token: string): Promise<WorkspaceRow> => {
    if (token.length < 16 || token.length > 100) throw notFound('That board');
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.boardToken, token)).limit(1);
    if (!workspace) throw notFound('That board');
    return workspace;
  };

  const actorFrom = async (workspace: WorkspaceRow, memberId: string | null | undefined) => {
    if (!memberId) return null;
    const [member] = await db
      .select({ id: members.id, name: members.name })
      .from(members)
      .where(and(eq(members.id, memberId), eq(members.workspaceId, workspace.id), isNull(members.archivedAt)))
      .limit(1);
    return member ?? null;
  };

  r.use('/:token/*', async (c, next) => {
    deps.limiter.hit(`board:${c.req.param('token')}:${clientIp(c, deps)}`, 240, 60_000);
    await next();
  });

  r.get('/:token', async (c) => {
    deps.limiter.hit(`board:${clientIp(c, deps)}`, 240, 60_000);
    const workspace = await loadWorkspace(c.req.param('token'));
    const today = todayIn(workspace.timezone, deps.now());
    const features = FEATURES[workspace.edition];

    const people = await db
      .select({ id: members.id, name: members.name, title: members.title })
      .from(members)
      .where(and(eq(members.workspaceId, workspace.id), isNull(members.archivedAt)))
      .orderBy(asc(members.name));

    const taskRows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspace.id),
          or(
            and(inArray(tasks.status, ['todo', 'doing']), lte(tasks.dueOn, today)),
            and(eq(tasks.status, 'done'), sql`(${tasks.completedAt} at time zone ${workspace.timezone})::date = ${today}`),
          ),
        ),
      )
      .orderBy(sql`case when ${tasks.status} in ('todo','doing') then 0 else 1 end`, asc(tasks.dueOn), asc(tasks.createdAt))
      .limit(60);

    const restock = await loadRestock(db, workspace.id, today, workspace.timezone, { includeDoneDays: 0 });

    const week = features.meals ? await loadMeals(db, workspace.id, startOfWeek(today), addDays(startOfWeek(today), 6)) : [];
    const eventRows = await db
      .select()
      .from(events)
      .where(and(eq(events.workspaceId, workspace.id), between(events.date, today, addDays(today, 7))))
      .orderBy(asc(events.date));

    const board: BoardDTO = {
      workspaceName: workspace.name,
      edition: workspace.edition,
      today,
      timezone: workspace.timezone,
      members: people,
      tasks: taskRows.map((task) => ({ ...taskDTO(task), notes: null })),
      restock: restock.map((entry) => ({ ...entry, estCostCents: 0, actualCostCents: null })),
      tonight: week.find((meal) => meal.date === today && meal.slot === 'dinner') ?? null,
      week,
      events: eventRows.map(eventDTO),
    };
    return c.json(board);
  });

  r.post('/:token/tasks/:id/toggle', async (c) => {
    const workspace = await loadWorkspace(c.req.param('token'));
    const input = await readBody(c, boardActorInput);
    const actor = await actorFrom(workspace, input.memberId);
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, idParam(c)), eq(tasks.workspaceId, workspace.id)))
      .limit(1);
    if (!task) throw notFound('That task');

    const today = todayIn(workspace.timezone, deps.now());
    if (task.status === 'done') {
      await reopenTask(db, task, deps.now());
      await announce(deps, workspace.id, actor, { scopes: ['tasks', 'members', 'board'], summary: `reopened “${task.title}” on the board`, objectType: 'task', objectId: task.id });
    } else {
      await finishTask(db, task, 'done', actor?.id ?? null, today, deps.now());
      await announce(deps, workspace.id, actor, { scopes: ['tasks', 'members', 'board'], summary: `finished “${task.title}” on the board`, objectType: 'task', objectId: task.id });
    }
    return c.json({ ok: true });
  });

  r.post('/:token/restock/:id/toggle', async (c) => {
    const workspace = await loadWorkspace(c.req.param('token'));
    const input = await readBody(c, boardActorInput);
    const actor = await actorFrom(workspace, input.memberId);
    const [entry] = await db
      .select()
      .from(restockEntries)
      .where(and(eq(restockEntries.id, idParam(c)), eq(restockEntries.workspaceId, workspace.id)))
      .limit(1);
    if (!entry) throw notFound('That list entry');

    const today = todayIn(workspace.timezone, deps.now());
    if (entry.status === 'bought') {
      await undoBought(db, entry, actor?.id ?? null, deps.now());
      await announce(deps, workspace.id, actor, { scopes: ['restock', 'items', 'money', 'board'], summary: `put ${entry.name} back on the list`, objectType: 'restock', objectId: entry.id });
    } else {
      await markBought(db, workspace, entry, actor?.id ?? null, {}, today, deps.now());
      await announce(deps, workspace.id, actor, { scopes: ['restock', 'items', 'money', 'board'], summary: `bought ${entry.name}`, objectType: 'restock', objectId: entry.id });
    }
    return c.json({ ok: true });
  });

  r.get('/:token/stream', async (c) => {
    const workspace = await loadWorkspace(c.req.param('token'));
    return streamSSE(c, async (stream) => {
      let closed = false;
      const unsubscribe = deps.bus.subscribe(workspace.id, (event) => {
        // The board only needs to know something changed. Names and details stay out of the public stream.
        void stream.writeSSE({ event: 'change', data: JSON.stringify({ scopes: event.scopes, at: event.at }) }).catch(() => undefined);
      });
      stream.onAbort(() => {
        closed = true;
        unsubscribe();
      });
      await stream.writeSSE({ event: 'ready', data: '{}' });
      while (!closed) {
        await stream.sleep(25_000);
        if (!closed) await stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => undefined);
      }
      unsubscribe();
    });
  });

  return r;
}
