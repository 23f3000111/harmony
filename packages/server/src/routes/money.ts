import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { anchorDayOf, billInput, billUpdate, budgetsInput, expenseInput, expenseUpdate, monthKey, type ExpenseDTO } from '@harmony/shared';
import { announceFrom, idParam, needFeature, needManager, readBody, type AppDeps, type AppEnv, type Ctx } from '../context';
import { bills, budgets, expenses, members } from '../db/schema';
import { conflict, notFound } from '../errors';
import { billDTO, payBill, recentExpenses, spendingSummary, undoBillPayment } from '../services/money';

const validMonth = (value: string | undefined, today: string) => (value && /^\d{4}-\d{2}$/.test(value) ? value : monthKey(today));

export function moneyRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  r.use('*', async (c, next) => {
    needManager(c as Ctx);
    await next();
  });

  r.get('/summary', async (c) => {
    const month = validMonth(c.req.query('month'), c.get('today'));
    return c.json(await spendingSummary(db, c.get('workspace').id, month));
  });

  r.get('/expenses', async (c) => {
    const month = validMonth(c.req.query('month'), c.get('today'));
    const rows = await recentExpenses(db, c.get('workspace').id, month);
    const ids = [...new Set(rows.map((row) => row.memberId).filter((id): id is string => Boolean(id)))];
    const people = ids.length ? await db.select({ id: members.id, name: members.name }).from(members).where(inArray(members.id, ids)) : [];
    const names = new Map(people.map((person) => [person.id, person.name]));
    const list: ExpenseDTO[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      amountCents: row.amountCents,
      spentOn: row.spentOn,
      paymentMethod: row.paymentMethod,
      source: row.source,
      notes: row.notes,
      memberName: row.memberId ? (names.get(row.memberId) ?? null) : null,
    }));
    return c.json({ expenses: list });
  });

  r.post('/expenses', async (c) => {
    const input = await readBody(c, expenseInput);
    const [expense] = await db
      .insert(expenses)
      .values({ ...input, workspaceId: c.get('workspace').id, memberId: c.get('member').id })
      .returning();
    await announceFrom(deps, c as Ctx, { scopes: ['money'], summary: `logged ${expense!.title}`, objectType: 'expense', objectId: expense!.id });
    return c.json({ id: expense!.id }, 201);
  });

  const loadExpense = async (c: Ctx) => {
    const [expense] = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, idParam(c)), eq(expenses.workspaceId, c.get('workspace').id)))
      .limit(1);
    if (!expense) throw notFound('That expense');
    return expense;
  };

  r.patch('/expenses/:id', async (c) => {
    const expense = await loadExpense(c as Ctx);
    if (expense.source !== 'manual') throw conflict('This expense came from a bill, list or order. Change it there.');
    const input = await readBody(c, expenseUpdate);
    await db.update(expenses).set(input).where(eq(expenses.id, expense.id));
    await announceFrom(deps, c as Ctx, { scopes: ['money'] });
    return c.json({ ok: true });
  });

  r.delete('/expenses/:id', async (c) => {
    const expense = await loadExpense(c as Ctx);
    if (expense.source !== 'manual') throw conflict('This expense came from a bill, list or order. Undo it there.');
    await db.delete(expenses).where(eq(expenses.id, expense.id));
    await announceFrom(deps, c as Ctx, { scopes: ['money'], summary: `deleted ${expense.title}`, objectType: 'expense' });
    return c.json({ ok: true });
  });

  r.put('/budgets', async (c) => {
    const input = await readBody(c, budgetsInput);
    const workspaceId = c.get('workspace').id;
    await db.transaction(async (tx) => {
      await tx.delete(budgets).where(eq(budgets.workspaceId, workspaceId));
      const rows = input.budgets.filter((row) => row.amountCents > 0);
      if (rows.length) await tx.insert(budgets).values(rows.map((row) => ({ ...row, workspaceId })));
    });
    await announceFrom(deps, c as Ctx, { scopes: ['money'], summary: 'updated the budget', objectType: 'budget' });
    return c.json({ ok: true });
  });

  return r;
}

export function billRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  r.use('*', async (c, next) => {
    needManager(c as Ctx);
    needFeature(c as Ctx, 'bills');
    await next();
  });

  const load = async (c: Ctx) => {
    const [bill] = await db
      .select()
      .from(bills)
      .where(and(eq(bills.id, idParam(c)), eq(bills.workspaceId, c.get('workspace').id)))
      .limit(1);
    if (!bill) throw notFound('That bill');
    return bill;
  };

  r.get('/', async (c) => {
    const rows = await db
      .select()
      .from(bills)
      .where(eq(bills.workspaceId, c.get('workspace').id))
      .orderBy(asc(bills.status), asc(bills.dueOn), desc(bills.paidOn))
      .limit(300);
    return c.json({ bills: rows.map(billDTO) });
  });

  r.post('/', async (c) => {
    const input = await readBody(c, billInput);
    const [bill] = await db
      .insert(bills)
      .values({ ...input, workspaceId: c.get('workspace').id, anchorDay: anchorDayOf(input.dueOn) })
      .returning();
    await announceFrom(deps, c as Ctx, { scopes: ['bills', 'money'], summary: `added the ${bill!.name} bill`, objectType: 'bill', objectId: bill!.id });
    return c.json({ id: bill!.id }, 201);
  });

  r.patch('/:id', async (c) => {
    const bill = await load(c as Ctx);
    const input = await readBody(c, billUpdate);
    const changes = { ...input, ...(input.dueOn ? { anchorDay: anchorDayOf(input.dueOn) } : {}) };
    await db.update(bills).set(changes).where(eq(bills.id, bill.id));
    await announceFrom(deps, c as Ctx, { scopes: ['bills', 'money'] });
    return c.json({ ok: true });
  });

  r.post('/:id/pay', async (c) => {
    const bill = await load(c as Ctx);
    const updated = await payBill(db, bill, c.get('member').id, c.get('today'));
    if (updated !== bill) {
      await announceFrom(deps, c as Ctx, { scopes: ['bills', 'money'], summary: `paid the ${bill.name} bill`, objectType: 'bill', objectId: bill.id });
    }
    return c.json({ bill: billDTO(updated) });
  });

  r.post('/:id/undo', async (c) => {
    const bill = await load(c as Ctx);
    const updated = await undoBillPayment(db, bill);
    await announceFrom(deps, c as Ctx, { scopes: ['bills', 'money'], summary: `marked the ${bill.name} bill unpaid`, objectType: 'bill', objectId: bill.id });
    return c.json({ bill: billDTO(updated) });
  });

  r.delete('/:id', async (c) => {
    const bill = await load(c as Ctx);
    await db.delete(bills).where(eq(bills.id, bill.id));
    await announceFrom(deps, c as Ctx, { scopes: ['bills', 'money'], summary: `removed the ${bill.name} bill`, objectType: 'bill' });
    return c.json({ ok: true });
  });

  return r;
}
