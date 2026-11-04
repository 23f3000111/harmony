import { and, asc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { checklistInput, checklistUpdate, isoWeekKey, monthKey, type ChecklistDTO } from '@harmony/shared';
import { announceFrom, idParam, needManager, readBody, type AppDeps, type AppEnv, type Ctx } from '../context';
import type { DB } from '../db/types';
import { checklistRuns, checklists, type ChecklistRow } from '../db/schema';
import { notFound } from '../errors';

export function periodKeyFor(checklist: Pick<ChecklistRow, 'cadence'>, today: string): string {
  if (checklist.cadence === 'weekly') return isoWeekKey(today);
  if (checklist.cadence === 'monthly') return monthKey(today);
  return 'once';
}

/** Each checklist shows this week's or this month's run, so it starts fresh on its own while past runs stay stored. */
export async function loadChecklists(db: DB, workspaceId: string, today: string): Promise<ChecklistDTO[]> {
  const rows = await db.select().from(checklists).where(eq(checklists.workspaceId, workspaceId)).orderBy(asc(checklists.position), asc(checklists.createdAt));
  if (rows.length === 0) return [];
  const runs = await db.select().from(checklistRuns).where(inArray(checklistRuns.checklistId, rows.map((row) => row.id)));
  return rows.map((row) => {
    const periodKey = periodKeyFor(row, today);
    const run = runs.find((candidate) => candidate.checklistId === row.id && candidate.periodKey === periodKey);
    const done = run?.done ?? {};
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      cadence: row.cadence,
      steps: row.steps,
      periodKey,
      done,
      doneCount: row.steps.filter((step) => done[step.id]).length,
    };
  });
}

const withIds = (steps: { id?: string; title: string; hint?: string | null }[]) =>
  steps.map((step) => ({ id: step.id ?? crypto.randomUUID().slice(0, 8), title: step.title, hint: step.hint ?? null }));

export function checklistRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  const load = async (c: Ctx) => {
    const [checklist] = await db
      .select()
      .from(checklists)
      .where(and(eq(checklists.id, idParam(c)), eq(checklists.workspaceId, c.get('workspace').id)))
      .limit(1);
    if (!checklist) throw notFound('That checklist');
    return checklist;
  };

  r.get('/', async (c) => c.json({ checklists: await loadChecklists(db, c.get('workspace').id, c.get('today')) }));

  r.post('/', async (c) => {
    needManager(c as Ctx);
    const input = await readBody(c, checklistInput);
    const [checklist] = await db
      .insert(checklists)
      .values({ ...input, steps: withIds(input.steps), workspaceId: c.get('workspace').id })
      .returning();
    await announceFrom(deps, c as Ctx, { scopes: ['checklists'], summary: `created the ${checklist!.name} checklist`, objectType: 'checklist', objectId: checklist!.id });
    return c.json({ id: checklist!.id }, 201);
  });

  r.patch('/:id', async (c) => {
    needManager(c as Ctx);
    const checklist = await load(c as Ctx);
    const input = await readBody(c, checklistUpdate);
    const { steps, ...rest } = input;
    await db
      .update(checklists)
      .set({ ...rest, ...(steps ? { steps: withIds(steps) } : {}) })
      .where(eq(checklists.id, checklist.id));
    await announceFrom(deps, c as Ctx, { scopes: ['checklists'] });
    return c.json({ ok: true });
  });

  r.delete('/:id', async (c) => {
    needManager(c as Ctx);
    const checklist = await load(c as Ctx);
    await db.delete(checklists).where(eq(checklists.id, checklist.id));
    await announceFrom(deps, c as Ctx, { scopes: ['checklists'], summary: `deleted the ${checklist.name} checklist`, objectType: 'checklist' });
    return c.json({ ok: true });
  });

  /** Anyone can tick a step. */
  r.post('/:id/steps/:stepId/toggle', async (c) => {
    const checklist = await load(c as Ctx);
    const stepId = c.req.param('stepId');
    const step = checklist.steps.find((candidate) => candidate.id === stepId);
    if (!step) throw notFound('That step');
    const periodKey = periodKeyFor(checklist, c.get('today'));
    const member = c.get('member');

    const done = await db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(checklistRuns)
        .where(and(eq(checklistRuns.checklistId, checklist.id), eq(checklistRuns.periodKey, periodKey)))
        .limit(1);
      const next = { ...(run?.done ?? {}) };
      if (next[stepId]) delete next[stepId];
      else next[stepId] = { memberName: member.name, at: deps.now().toISOString() };
      if (run) await tx.update(checklistRuns).set({ done: next }).where(eq(checklistRuns.id, run.id));
      else await tx.insert(checklistRuns).values({ checklistId: checklist.id, periodKey, done: next });
      return next;
    });

    const finishedNow = checklist.steps.every((candidate) => done[candidate.id]);
    await announceFrom(deps, c as Ctx, {
      scopes: ['checklists'],
      summary: finishedNow ? `finished ${checklist.name}` : undefined,
      objectType: 'checklist',
      objectId: checklist.id,
    });
    return c.json({ done });
  });

  return r;
}
