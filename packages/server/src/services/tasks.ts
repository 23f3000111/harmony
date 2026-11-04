import { and, eq, sql } from 'drizzle-orm';
import { nextOccurrenceAfter, type TaskDTO } from '@harmony/shared';
import type { DB } from '../db/types';
import { tasks, type TaskRow } from '../db/schema';

/** Priorities are words, so they need an explicit order: high first. */
export const byPriority = sql`case ${tasks.priority} when 'high' then 0 when 'normal' then 1 else 2 end`;

export function taskDTO(row: TaskRow): TaskDTO {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    area: row.area,
    assigneeId: row.assigneeId,
    dueOn: row.dueOn,
    priority: row.priority,
    status: row.status,
    recurrence: row.recurrence,
    seriesId: row.seriesId,
    completedAt: row.completedAt?.toISOString() ?? null,
    completedById: row.completedById,
    estimatedMinutes: row.estimatedMinutes,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Finishing a repeating task keeps this record as history and schedules the next one.
 * A skipped task also moves the series on, but never counts as done.
 */
export async function finishTask(db: DB, task: TaskRow, outcome: 'done' | 'skipped', actorId: string | null, today: string, now: Date): Promise<TaskRow> {
  if (task.status === 'done' || task.status === 'skipped') return task;

  return db.transaction(async (tx) => {
    const seriesId = task.recurrence === 'none' ? task.seriesId : (task.seriesId ?? task.id);
    let spawnedNextId: string | null = null;

    if (task.recurrence !== 'none') {
      const dueOn = nextOccurrenceAfter(task.dueOn ?? today, task.recurrence, today, task.anchorDay);
      if (dueOn) {
        const [next] = await tx
          .insert(tasks)
          .values({
            workspaceId: task.workspaceId,
            title: task.title,
            notes: task.notes,
            area: task.area,
            assigneeId: task.assigneeId,
            createdById: task.createdById,
            dueOn,
            priority: task.priority,
            recurrence: task.recurrence,
            anchorDay: task.anchorDay,
            seriesId,
            estimatedMinutes: task.estimatedMinutes,
          })
          .returning({ id: tasks.id });
        spawnedNextId = next!.id;
      }
    }

    const [updated] = await tx
      .update(tasks)
      .set({
        status: outcome,
        seriesId,
        spawnedNextId,
        completedAt: outcome === 'done' ? now : null,
        completedById: outcome === 'done' ? actorId : null,
        updatedAt: now,
      })
      .where(eq(tasks.id, task.id))
      .returning();
    return updated!;
  });
}

/** Undo. Removes the repeat that finishing created, unless someone has already started on it. */
export async function reopenTask(db: DB, task: TaskRow, now: Date): Promise<TaskRow> {
  if (task.status !== 'done' && task.status !== 'skipped') return task;
  return db.transaction(async (tx) => {
    if (task.spawnedNextId) {
      await tx.delete(tasks).where(and(eq(tasks.id, task.spawnedNextId), eq(tasks.status, 'todo')));
    }
    const [updated] = await tx
      .update(tasks)
      .set({ status: 'todo', completedAt: null, completedById: null, spawnedNextId: null, updatedAt: now })
      .where(eq(tasks.id, task.id))
      .returning();
    return updated!;
  });
}
