import { and, between, desc, eq, sql } from 'drizzle-orm';
import { addMonthKey, monthRange, nextOccurrence, type BillDTO, type SpendingSummary } from '@harmony/shared';
import type { DB } from '../db/types';
import { bills, budgets, expenses, type BillRow } from '../db/schema';

export function billDTO(row: BillRow): BillDTO {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    category: row.category,
    amountCents: row.amountCents,
    dueOn: row.dueOn,
    recurrence: row.recurrence,
    paymentMethod: row.paymentMethod,
    status: row.status,
    paidOn: row.paidOn,
  };
}

/** A bill only becomes an expense when it is paid, so nothing is ever counted twice. */
export async function payBill(db: DB, bill: BillRow, actorId: string | null, today: string): Promise<BillRow> {
  if (bill.status === 'paid') return bill;
  return db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(expenses)
      .values({
        workspaceId: bill.workspaceId,
        title: bill.name,
        category: bill.category,
        amountCents: bill.amountCents,
        spentOn: today,
        paymentMethod: bill.paymentMethod,
        source: 'bill',
        sourceId: bill.id,
        memberId: actorId,
      })
      .returning({ id: expenses.id });

    let spawnedNextId: string | null = null;
    const dueOn = nextOccurrence(bill.dueOn, bill.recurrence, bill.anchorDay);
    if (dueOn) {
      const [next] = await tx
        .insert(bills)
        .values({
          workspaceId: bill.workspaceId,
          name: bill.name,
          provider: bill.provider,
          category: bill.category,
          amountCents: bill.amountCents,
          dueOn,
          recurrence: bill.recurrence,
          anchorDay: bill.anchorDay,
          paymentMethod: bill.paymentMethod,
        })
        .returning({ id: bills.id });
      spawnedNextId = next!.id;
    }

    const [updated] = await tx
      .update(bills)
      .set({ status: 'paid', paidOn: today, expenseId: expense!.id, spawnedNextId })
      .where(eq(bills.id, bill.id))
      .returning();
    return updated!;
  });
}

export async function undoBillPayment(db: DB, bill: BillRow): Promise<BillRow> {
  if (bill.status !== 'paid') return bill;
  return db.transaction(async (tx) => {
    if (bill.expenseId) await tx.delete(expenses).where(eq(expenses.id, bill.expenseId));
    if (bill.spawnedNextId) await tx.delete(bills).where(and(eq(bills.id, bill.spawnedNextId), eq(bills.status, 'due')));
    const [updated] = await tx.update(bills).set({ status: 'due', paidOn: null, expenseId: null, spawnedNextId: null }).where(eq(bills.id, bill.id)).returning();
    return updated!;
  });
}

export async function spendingSummary(db: DB, workspaceId: string, month: string, monthsBack = 6): Promise<SpendingSummary> {
  const { start, end } = monthRange(month);

  const spentRows = await db
    .select({ category: expenses.category, cents: sql<string>`coalesce(sum(${expenses.amountCents}), 0)` })
    .from(expenses)
    .where(and(eq(expenses.workspaceId, workspaceId), between(expenses.spentOn, start, end)))
    .groupBy(expenses.category);
  const spent = new Map(spentRows.map((row) => [row.category, Number(row.cents)]));

  const budgetRows = await db.select().from(budgets).where(eq(budgets.workspaceId, workspaceId));
  const budgeted = new Set(budgetRows.map((row) => row.category));

  const byCategory = budgetRows
    .map((row) => ({ category: row.category, amountCents: row.amountCents, spentCents: spent.get(row.category) ?? 0 }))
    .concat(
      [...spent.entries()]
        .filter(([category]) => !budgeted.has(category))
        .map(([category, spentCents]) => ({ category, amountCents: 0, spentCents })),
    )
    .sort((a, b) => b.spentCents - a.spentCents || b.amountCents - a.amountCents);

  const firstMonth = addMonthKey(month, -(monthsBack - 1));
  const monthRows = await db
    .select({ month: sql<string>`to_char(${expenses.spentOn}, 'YYYY-MM')`, cents: sql<string>`coalesce(sum(${expenses.amountCents}), 0)` })
    .from(expenses)
    .where(and(eq(expenses.workspaceId, workspaceId), between(expenses.spentOn, monthRange(firstMonth).start, end)))
    .groupBy(sql`to_char(${expenses.spentOn}, 'YYYY-MM')`);
  const perMonth = new Map(monthRows.map((row) => [row.month, Number(row.cents)]));
  const byMonth = Array.from({ length: monthsBack }, (_, index) => {
    const key = addMonthKey(firstMonth, index);
    return { month: key, spentCents: perMonth.get(key) ?? 0 };
  });

  const spentCents = byCategory.reduce((sum, line) => sum + line.spentCents, 0);
  const budgetCents = budgetRows.reduce((sum, row) => sum + row.amountCents, 0);
  const unbudgetedCents = byCategory.filter((line) => line.amountCents === 0).reduce((sum, line) => sum + line.spentCents, 0);

  return { month, spentCents, budgetCents, byCategory, byMonth, unbudgetedCents };
}

export async function recentExpenses(db: DB, workspaceId: string, month: string) {
  const { start, end } = monthRange(month);
  return db
    .select()
    .from(expenses)
    .where(and(eq(expenses.workspaceId, workspaceId), between(expenses.spentOn, start, end)))
    .orderBy(desc(expenses.spentOn), desc(expenses.createdAt));
}
