import { and, asc, between, desc, eq, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  addDays,
  addMonthKey,
  canManage,
  canSeeMoney,
  diffDays,
  FEATURES,
  monthKey,
  monthRange,
  occurrencesBetween,
  startOfWeek,
  stockLevel,
  type ActivityDTO,
  type BillDTO,
  type DashboardDTO,
  type MonthAheadDTO,
  type SearchHit,
  type ShelfItem,
  type UpcomingDTO,
} from '@harmony/shared';
import { needManager, needOwner, type AppDeps, type AppEnv, type Ctx } from '../context';
import type { DB } from '../db/types';
import {
  activity,
  bills,
  budgets,
  checklists,
  events,
  expenses,
  items,
  meals,
  members,
  purchaseOrderLines,
  purchaseOrders,
  recipes,
  requests,
  restockEntries,
  stockMovements,
  suppliers,
  tasks,
  workspaces,
} from '../db/schema';
import { notFound } from '../errors';
import { billDTO, spendingSummary } from '../services/money';
import { loadOrders, orderNumber } from '../services/orders';
import { loadItems, loadRestock } from '../services/stock';
import { byPriority, taskDTO } from '../services/tasks';
import { loadChecklists } from './checklists';
import { eventDTO, loadMeals } from './meals';
import { requestDTOs } from './requests';
import { escapeLike } from './tasks';
import { loadMemberStats } from './workspaces';

export async function loadActivity(db: DB, workspaceId: string, limit: number, offset = 0, managerView = false): Promise<ActivityDTO[]> {
  const conditions = [eq(activity.workspaceId, workspaceId)];
  if (!managerView) conditions.push(eq(activity.audience, 'all'));
  const rows = await db
    .select()
    .from(activity)
    .where(and(...conditions))
    .orderBy(desc(activity.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map((row) => ({
    id: row.id,
    actorName: row.actorName,
    summary: row.summary,
    objectType: row.objectType,
    objectId: row.objectId,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** The shelf mixes what's running low with what's fine, so it reads as a real shelf rather than a warning list. */
function pickShelf(list: { id: string; name: string; quantity: number; minQty: number; targetQty: number | null; unit: string; forecast: { status: ShelfItem['status'] } }[]): ShelfItem[] {
  const withLevel = list.map((item) => ({ item, level: stockLevel(item.quantity, item.minQty, item.targetQty) })).sort((a, b) => a.level - b.level);
  const picked = withLevel.length <= 8 ? withLevel : [...withLevel.slice(0, 5), ...withLevel.slice(-3)];
  return picked
    .map(({ item, level }) => ({ id: item.id, name: item.name, level, status: item.forecast.status, quantity: item.quantity, unit: item.unit }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadDashboard(deps: AppDeps, c: Ctx): Promise<DashboardDTO> {
  const { db } = deps;
  const workspace = c.get('workspace');
  const member = c.get('member');
  const today = c.get('today');
  const now = deps.now();
  const features = FEATURES[workspace.edition];
  const showMoney = canSeeMoney(member.role);
  const manager = canManage(member.role);
  const weekStart = startOfWeek(today);
  const openStatus = inArray(tasks.status, ['todo', 'doing']);
  const where = eq(tasks.workspaceId, workspace.id);

  const memberStats = await loadMemberStats(db, workspace.id, today, workspace.timezone, now);
  const me = memberStats.find((person) => person.id === member.id)!;

  const todayRows = await db
    .select()
    .from(tasks)
    .where(and(where, or(and(openStatus, lte(tasks.dueOn, today)), and(eq(tasks.status, 'done'), eq(tasks.dueOn, today)))))
    .orderBy(sql`case when ${tasks.status} in ('todo','doing') then 0 else 1 end`, asc(tasks.dueOn), byPriority, asc(tasks.createdAt))
    .limit(80);

  const [counts] = await db
    .select({
      open: sql<string>`count(*) filter (where ${tasks.status} in ('todo','doing'))`,
      overdue: sql<string>`count(*) filter (where ${tasks.status} in ('todo','doing') and ${tasks.dueOn} < ${today})`,
      dueToday: sql<string>`count(*) filter (where ${tasks.status} in ('todo','doing') and ${tasks.dueOn} = ${today})`,
      doneToday: sql<string>`count(*) filter (where ${tasks.status} = 'done' and (${tasks.completedAt} at time zone ${workspace.timezone})::date = ${today})`,
      doneThisWeek: sql<string>`count(*) filter (where ${tasks.status} = 'done' and (${tasks.completedAt} at time zone ${workspace.timezone})::date >= ${weekStart})`,
      myOpen: sql<string>`count(*) filter (where ${tasks.status} in ('todo','doing') and ${tasks.assigneeId} = ${member.id})`,
      myOverdue: sql<string>`count(*) filter (where ${tasks.status} in ('todo','doing') and ${tasks.dueOn} < ${today} and ${tasks.assigneeId} = ${member.id})`,
    })
    .from(tasks)
    .where(where);

  const firstWeek = addDays(weekStart, -7 * 7);
  const weekRows = await db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${tasks.completedAt} at time zone ${workspace.timezone}), 'YYYY-MM-DD')`,
      done: sql<string>`count(*)`,
    })
    .from(tasks)
    .where(and(where, eq(tasks.status, 'done'), sql`(${tasks.completedAt} at time zone ${workspace.timezone})::date >= ${firstWeek}`))
    .groupBy(sql`1`);
  const weekMap = new Map(weekRows.map((row) => [row.week, Number(row.done)]));
  const perWeek = Array.from({ length: 8 }, (_, index) => {
    const start = addDays(firstWeek, index * 7);
    return { weekStart: start, done: weekMap.get(start) ?? 0 };
  });

  const timelineRows = await db
    .select({ id: tasks.id, title: tasks.title, dueOn: tasks.dueOn, status: tasks.status, assigneeId: tasks.assigneeId, priority: tasks.priority })
    .from(tasks)
    .where(and(where, between(tasks.dueOn, weekStart, addDays(weekStart, 13))))
    .orderBy(asc(tasks.dueOn), byPriority)
    .limit(300);

  const itemList = await loadItems(db, workspace, today, now);
  const lowCount = itemList.filter((item) => item.forecast.status === 'low' || item.forecast.status === 'out').length;
  const runningOut = itemList
    .filter((item) => item.forecast.runsOutOn && item.forecast.daysLeft !== null && item.forecast.status !== 'ok')
    .sort((a, b) => a.forecast.daysLeft! - b.forecast.daysLeft!)
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      name: item.name,
      daysLeft: item.forecast.daysLeft!,
      runsOutOn: item.forecast.runsOutOn!,
      unit: item.unit,
      quantity: item.quantity,
      status: item.forecast.status,
    }));
  const useFirst = itemList
    .filter((item) => item.expiresOn && item.expiresOn <= addDays(today, 5) && item.quantity > 0)
    .sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!))
    .slice(0, 6)
    .map((item) => ({ id: item.id, name: item.name, expiresOn: item.expiresOn!, quantity: item.quantity, unit: item.unit, location: item.location }));

  const restock = (await loadRestock(db, workspace.id, today, workspace.timezone)).filter((entry) => entry.status === 'needed');

  let money: DashboardDTO['money'] = null;
  const upcoming: UpcomingDTO[] = [];
  const horizon = addDays(today, 14);

  if (showMoney) {
    const summary = await spendingSummary(db, workspace.id, monthKey(today));
    let billsDueCount = 0;
    let billsDueCents = 0;
    let nextBill: BillDTO | null = null;
    if (features.bills) {
      const dueRows = await db
        .select()
        .from(bills)
        .where(and(eq(bills.workspaceId, workspace.id), eq(bills.status, 'due'), lte(bills.dueOn, horizon)))
        .orderBy(asc(bills.dueOn));
      billsDueCount = dueRows.length;
      billsDueCents = dueRows.reduce((sum, row) => sum + row.amountCents, 0);
      nextBill = dueRows[0] ? billDTO(dueRows[0]) : null;
      for (const bill of dueRows) {
        upcoming.push({ id: bill.id, kind: 'bill', title: bill.name, date: bill.dueOn, time: null, detail: bill.provider, amountCents: bill.amountCents, personId: null, href: 'spending' });
      }
    }
    money = {
      monthSpentCents: summary.spentCents,
      monthBudgetCents: summary.budgetCents,
      byMonth: summary.byMonth,
      byCategory: summary.byCategory,
      billsDueCount,
      billsDueCents,
      nextBill,
    };
  }

  const eventRows = await db
    .select()
    .from(events)
    .where(and(eq(events.workspaceId, workspace.id), between(events.date, today, horizon)))
    .orderBy(asc(events.date));
  for (const event of eventRows) {
    upcoming.push({ id: event.id, kind: 'event', title: event.title, date: event.date, time: event.time, detail: event.notes, amountCents: null, personId: null, href: 'month' });
  }

  const myNext = await db
    .select()
    .from(tasks)
    .where(and(where, openStatus, eq(tasks.assigneeId, member.id), between(tasks.dueOn, addDays(today, 1), horizon)))
    .orderBy(asc(tasks.dueOn))
    .limit(3);
  for (const task of myNext) {
    upcoming.push({ id: task.id, kind: 'task', title: task.title, date: task.dueOn!, time: null, detail: task.area, amountCents: null, personId: member.id, href: `tasks?open=${task.id}` });
  }

  let mealsData: DashboardDTO['meals'] = null;
  if (features.meals) {
    const week = await loadMeals(db, workspace.id, weekStart, addDays(weekStart, 6));
    mealsData = { week, tonight: week.find((meal) => meal.date === today && meal.slot === 'dinner') ?? null };
  }

  let requestsData: DashboardDTO['requests'] = null;
  if (features.requests) {
    const [openRow] = await db
      .select({ count: sql<string>`count(*)` })
      .from(requests)
      .where(and(eq(requests.workspaceId, workspace.id), eq(requests.status, 'open')));
    const waiting = manager
      ? await db
          .select()
          .from(requests)
          .where(and(eq(requests.workspaceId, workspace.id), eq(requests.status, 'open')))
          .orderBy(desc(requests.createdAt))
          .limit(6)
      : [];
    const mine = await db
      .select()
      .from(requests)
      .where(and(eq(requests.workspaceId, workspace.id), eq(requests.requestedById, member.id)))
      .orderBy(desc(requests.createdAt))
      .limit(5);
    requestsData = {
      openCount: Number(openRow?.count ?? 0),
      waiting: await requestDTOs(db, workspace.id, waiting),
      mine: await requestDTOs(db, workspace.id, mine),
    };
  }

  let ordersData: DashboardDTO['orders'] = null;
  if (features.orders && manager) {
    const open = await loadOrders(db, workspace.id, { statuses: ['sent', 'partial'] });
    const [drafts] = await db
      .select({ count: sql<string>`count(*)` })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.workspaceId, workspace.id), eq(purchaseOrders.status, 'draft')));
    const awaitingDelivery = open.sort((a, b) => (a.expectedOn ?? '9').localeCompare(b.expectedOn ?? '9'));
    ordersData = {
      openCount: open.length,
      openCents: open.reduce((sum, order) => sum + (order.totalCents - order.receivedCents), 0),
      awaitingDelivery,
      lateCount: open.filter((order) => order.expectedOn && order.expectedOn < today).length,
      draftCount: Number(drafts?.count ?? 0),
    };
    for (const order of awaitingDelivery) {
      if (order.expectedOn && order.expectedOn <= horizon) {
        upcoming.push({
          id: order.id,
          kind: 'delivery',
          title: `${order.number} from ${order.supplierName}`,
          date: order.expectedOn,
          time: null,
          detail: null,
          amountCents: order.totalCents - order.receivedCents,
          personId: null,
          href: `orders/${order.id}`,
        });
      }
    }
  }

  const allChecklists = await loadChecklists(db, workspace.id, today);

  return {
    today,
    me,
    members: memberStats,
    tasks: {
      mine: todayRows.filter((task) => task.assigneeId === member.id).map(taskDTO),
      today: todayRows.map(taskDTO),
      overdueCount: Number(counts?.overdue ?? 0),
      openCount: Number(counts?.open ?? 0),
      dueTodayCount: Number(counts?.dueToday ?? 0),
      doneTodayCount: Number(counts?.doneToday ?? 0),
      doneThisWeek: Number(counts?.doneThisWeek ?? 0),
      myOpenCount: Number(counts?.myOpen ?? 0),
      myOverdueCount: Number(counts?.myOverdue ?? 0),
      perWeek,
    },
    timeline: { start: weekStart, tasks: timelineRows.map((task) => ({ ...task, dueOn: task.dueOn! })) },
    stock: { shelf: pickShelf(itemList), lowCount, itemCount: itemList.length, runningOut, useFirst },
    restock: {
      openCount: restock.length,
      estCents: showMoney ? restock.reduce((sum, entry) => sum + entry.estCostCents, 0) : 0,
      top: restock.slice(0, 6).map((entry) => (showMoney ? entry : { ...entry, estCostCents: 0, actualCostCents: null })),
    },
    money,
    meals: mealsData,
    requests: requestsData,
    orders: ordersData,
    checklist: allChecklists.find((list) => list.cadence !== 'once') ?? allChecklists[0] ?? null,
    upcoming: upcoming.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')).slice(0, 8),
    activity: await loadActivity(db, workspace.id, 8, 0, manager),
  };
}

/** Which month to plan by default: this one, until the last week, when next month matters more. */
const defaultPlanningMonth = (today: string) => (Number(today.slice(8, 10)) >= 25 ? addMonthKey(monthKey(today), 1) : monthKey(today));

async function loadMonthAhead(deps: AppDeps, c: Ctx, requested: string | undefined): Promise<MonthAheadDTO> {
  const { db } = deps;
  const workspace = c.get('workspace');
  const member = c.get('member');
  const today = c.get('today');
  const now = deps.now();
  const features = FEATURES[workspace.edition];
  const showMoney = canSeeMoney(member.role);

  const month = requested && /^\d{4}-\d{2}$/.test(requested) && requested >= monthKey(today) ? requested : defaultPlanningMonth(today);
  const range = monthRange(month);
  const start = range.start < today ? today : range.start;
  const end = range.end;
  const horizonDays = Math.max(1, diffDays(end, today) + 1);

  const itemList = await loadItems(db, workspace, today, now, horizonDays);
  // Items with enough already on order drop out here, so nothing is bought twice.
  const restock = itemList
    .filter((item) => item.forecast.suggestedQty > 0)
    .sort((a, b) => (a.forecast.runsOutOn ?? '9999').localeCompare(b.forecast.runsOutOn ?? '9999'))
    .map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      minQty: item.minQty,
      category: item.category,
      supplierName: item.supplierName,
      onList: item.onList,
      forecast: item.forecast,
    }));
  const restockCents = restock.reduce((sum, item) => sum + item.forecast.suggestedCostCents, 0);

  const openTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspace.id), inArray(tasks.status, ['todo', 'doing']), sql`${tasks.dueOn} is not null`, lte(tasks.dueOn, end)));

  const memberRows = await db
    .select({ id: members.id, name: members.name })
    .from(members)
    .where(and(eq(members.workspaceId, workspace.id), isNull(members.archivedAt)));
  const names = new Map(memberRows.map((person) => [person.id, person.name]));

  const taskList: MonthAheadDTO['tasks']['list'] = [];
  const perPerson = new Map<string | null, { memberId: string | null; name: string; count: number; minutes: number }>();
  const byDate: Record<string, number> = {};
  let minutes = 0;

  for (const task of openTasks) {
    const dates = occurrencesBetween(task.dueOn!, task.recurrence, start, end, task.anchorDay);
    for (const date of dates) {
      taskList.push({ title: task.title, date, assigneeId: task.assigneeId, recurrence: task.recurrence });
      byDate[date] = (byDate[date] ?? 0) + 1;
      const person = perPerson.get(task.assigneeId) ?? {
        memberId: task.assigneeId,
        name: task.assigneeId ? (names.get(task.assigneeId) ?? 'Removed') : 'Not assigned',
        count: 0,
        minutes: 0,
      };
      person.count += 1;
      person.minutes += task.estimatedMinutes ?? 0;
      perPerson.set(task.assigneeId, person);
      minutes += task.estimatedMinutes ?? 0;
    }
  }

  const billList: MonthAheadDTO['bills'] = [];
  if (showMoney && features.bills) {
    const dueRows = await db.select().from(bills).where(and(eq(bills.workspaceId, workspace.id), eq(bills.status, 'due'), lte(bills.dueOn, end)));
    for (const bill of dueRows) {
      for (const date of occurrencesBetween(bill.dueOn, bill.recurrence, start, end, bill.anchorDay)) {
        billList.push({ id: `${bill.id}:${date}`, name: bill.name, amountCents: bill.amountCents, dueOn: date, recurring: date !== bill.dueOn });
      }
    }
    billList.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  }
  const billsCents = billList.reduce((sum, bill) => sum + bill.amountCents, 0);

  const eventRows = await db
    .select()
    .from(events)
    .where(and(eq(events.workspaceId, workspace.id), between(events.date, start, end)))
    .orderBy(asc(events.date));

  const deliveries: MonthAheadDTO['deliveries'] = [];
  let deliveryCents = 0;
  if (features.orders && showMoney) {
    const open = await loadOrders(db, workspace.id, { statuses: ['sent', 'partial'] });
    for (const order of open) {
      if (order.expectedOn && order.expectedOn <= end) {
        const outstanding = order.totalCents - order.receivedCents;
        deliveries.push({ id: order.id, number: order.number, supplierName: order.supplierName, expectedOn: order.expectedOn < start ? start : order.expectedOn, totalCents: outstanding });
        deliveryCents += outstanding;
      }
    }
  }

  let budget: MonthAheadDTO['budget'] = { budgetCents: 0, committedCents: 0, lastMonthCents: 0 };
  if (showMoney) {
    const [budgetRow] = await db
      .select({ cents: sql<string>`coalesce(sum(${budgets.amountCents}), 0)` })
      .from(budgets)
      .where(eq(budgets.workspaceId, workspace.id));
    const spentIn = async (key: string) => {
      const { start: from, end: to } = monthRange(key);
      const [row] = await db
        .select({ cents: sql<string>`coalesce(sum(${expenses.amountCents}), 0)` })
        .from(expenses)
        .where(and(eq(expenses.workspaceId, workspace.id), between(expenses.spentOn, from, to)));
      return Number(row?.cents ?? 0);
    };
    const spentSoFar = month === monthKey(today) ? await spentIn(month) : 0;
    budget = {
      budgetCents: Number(budgetRow?.cents ?? 0),
      committedCents: spentSoFar + billsCents + restockCents + deliveryCents,
      lastMonthCents: await spentIn(addMonthKey(month, -1)),
    };
  }

  return {
    month,
    today,
    start,
    end,
    restock: showMoney ? restock : restock.map((item) => ({ ...item, forecast: { ...item.forecast, suggestedCostCents: 0 } })),
    restockCents: showMoney ? restockCents : 0,
    tasks: {
      total: taskList.length,
      minutes,
      perPerson: [...perPerson.values()].sort((a, b) => b.count - a.count),
      byDate,
      list: taskList.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 300),
    },
    bills: billList,
    billsCents,
    events: eventRows.map(eventDTO),
    deliveries,
    budget,
  };
}

const csvCell = (value: unknown) => {
  let text = value === null || value === undefined ? '' : String(value);
  // A spreadsheet would run a cell starting with one of these as a formula.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const toCsv = (rows: unknown[][]) => rows.map((row) => row.map(csvCell).join(',')).join('\r\n');

export function insightRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  r.get('/dashboard', async (c) => c.json(await loadDashboard(deps, c as Ctx)));

  r.get('/month-ahead', async (c) => c.json(await loadMonthAhead(deps, c as Ctx, c.req.query('month'))));

  r.get('/activity', async (c) => {
    const limit = Math.min(Number(c.req.query('limit')) || 30, 100);
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
    return c.json({ activity: await loadActivity(db, c.get('workspace').id, limit, offset, canManage(c.get('member').role)) });
  });

  r.get('/search', async (c) => {
    const q = c.req.query('q')?.trim() ?? '';
    if (q.length < 2) return c.json({ hits: [] });
    const workspace = c.get('workspace');
    const features = FEATURES[workspace.edition];
    const showMoney = canSeeMoney(c.get('member').role);
    const like = `%${escapeLike(q)}%`;
    const hits: SearchHit[] = [];

    const foundTasks = await db
      .select({ id: tasks.id, title: tasks.title, dueOn: tasks.dueOn })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspace.id), inArray(tasks.status, ['todo', 'doing']), ilike(tasks.title, like)))
      .limit(5);
    for (const task of foundTasks) hits.push({ id: task.id, kind: 'task', title: task.title, detail: task.dueOn, href: `tasks?open=${task.id}` });

    const foundItems = await db
      .select({ id: items.id, name: items.name, quantity: items.quantity, unit: items.unit })
      .from(items)
      .where(and(eq(items.workspaceId, workspace.id), isNull(items.archivedAt), ilike(items.name, like)))
      .limit(5);
    for (const item of foundItems) hits.push({ id: item.id, kind: 'item', title: item.name, detail: `${item.quantity} ${item.unit}`, href: `items?open=${item.id}` });

    const foundPeople = await db
      .select({ id: members.id, name: members.name, title: members.title })
      .from(members)
      .where(and(eq(members.workspaceId, workspace.id), isNull(members.archivedAt), ilike(members.name, like)))
      .limit(5);
    for (const person of foundPeople) hits.push({ id: person.id, kind: 'person', title: person.name, detail: person.title, href: 'people' });

    if (features.suppliers) {
      const found = await db
        .select({ id: suppliers.id, name: suppliers.name, category: suppliers.category })
        .from(suppliers)
        .where(and(eq(suppliers.workspaceId, workspace.id), isNull(suppliers.archivedAt), ilike(suppliers.name, like)))
        .limit(5);
      for (const supplier of found) hits.push({ id: supplier.id, kind: 'supplier', title: supplier.name, detail: supplier.category, href: 'suppliers' });
    }

    if (features.requests) {
      const conditions = [eq(requests.workspaceId, workspace.id), ilike(requests.title, like)];
      if (!canManage(c.get('member').role)) conditions.push(eq(requests.requestedById, c.get('member').id));
      const found = await db.select({ id: requests.id, title: requests.title, status: requests.status }).from(requests).where(and(...conditions)).limit(5);
      for (const request of found) hits.push({ id: request.id, kind: 'request', title: request.title, detail: request.status, href: `requests?open=${request.id}` });
    }

    if (features.orders && showMoney) {
      const numberMatch = q.replace(/^po-?/i, '').replace(/^0+/, '');
      const found = await db
        .select({ id: purchaseOrders.id, number: purchaseOrders.number, name: suppliers.name })
        .from(purchaseOrders)
        .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
        .where(
          and(
            eq(purchaseOrders.workspaceId, workspace.id),
            or(ilike(suppliers.name, like), /^\d+$/.test(numberMatch) ? eq(purchaseOrders.number, Number(numberMatch)) : sql`false`),
          ),
        )
        .orderBy(desc(purchaseOrders.number))
        .limit(5);
      for (const order of found) hits.push({ id: order.id, kind: 'order', title: orderNumber(order.number), detail: order.name, href: `orders/${order.id}` });
    }

    if (features.bills && showMoney) {
      const found = await db
        .select({ id: bills.id, name: bills.name, dueOn: bills.dueOn })
        .from(bills)
        .where(and(eq(bills.workspaceId, workspace.id), eq(bills.status, 'due'), ilike(bills.name, like)))
        .limit(5);
      for (const bill of found) hits.push({ id: bill.id, kind: 'bill', title: bill.name, detail: bill.dueOn, href: 'spending' });
    }

    return c.json({ hits });
  });

  r.get('/export/tasks.csv', async (c) => {
    needManager(c as Ctx);
    const workspace = c.get('workspace');
    const rows = await db.select().from(tasks).where(eq(tasks.workspaceId, workspace.id)).orderBy(desc(tasks.createdAt)).limit(20_000);
    const people = await db.select({ id: members.id, name: members.name }).from(members).where(eq(members.workspaceId, workspace.id));
    const names = new Map(people.map((person) => [person.id, person.name]));
    const csv = toCsv([
      ['Title', 'Area', 'Assigned to', 'Due', 'Priority', 'Status', 'Repeats', 'Finished at', 'Finished by'],
      ...rows.map((task) => [
        task.title,
        task.area,
        task.assigneeId ? names.get(task.assigneeId) : '',
        task.dueOn,
        task.priority,
        task.status,
        task.recurrence,
        task.completedAt?.toISOString(),
        task.completedById ? names.get(task.completedById) : '',
      ]),
    ]);
    return c.body(csv, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="tasks.csv"' });
  });

  r.get('/export/items.csv', async (c) => {
    needManager(c as Ctx);
    const list = await loadItems(db, c.get('workspace'), c.get('today'), deps.now());
    const csv = toCsv([
      ['Name', 'Category', 'Location', 'Quantity', 'Unit', 'Minimum', 'Target', 'Unit cost', 'Supplier', 'Runs out on', 'Expires on'],
      ...list.map((item) => [
        item.name,
        item.category,
        item.location,
        item.quantity,
        item.unit,
        item.minQty,
        item.targetQty,
        (item.unitCostCents / 100).toFixed(2),
        item.supplierName,
        item.forecast.runsOutOn,
        item.expiresOn,
      ]),
    ]);
    return c.body(csv, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="stock.csv"' });
  });

  r.get('/export/expenses.csv', async (c) => {
    needManager(c as Ctx);
    const rows = await db.select().from(expenses).where(eq(expenses.workspaceId, c.get('workspace').id)).orderBy(desc(expenses.spentOn)).limit(50_000);
    const csv = toCsv([
      ['Date', 'Description', 'Category', 'Amount', 'Payment method', 'Source'],
      ...rows.map((row) => [row.spentOn, row.title, row.category, (row.amountCents / 100).toFixed(2), row.paymentMethod, row.source]),
    ]);
    return c.body(csv, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="spending.csv"' });
  });

  /** Everything in the workspace, so owners can always take their data with them. */
  r.get('/export/all.json', async (c) => {
    needOwner(c as Ctx);
    const workspaceId = c.get('workspace').id;
    const [workspaceRow] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!workspaceRow) throw notFound();
    const { boardToken: _boardToken, ...workspace } = workspaceRow;
    const orders = await db.select().from(purchaseOrders).where(eq(purchaseOrders.workspaceId, workspaceId));
    const data = {
      exportedAt: deps.now().toISOString(),
      workspace,
      members: await db.select({ id: members.id, name: members.name, role: members.role, title: members.title, department: members.department }).from(members).where(eq(members.workspaceId, workspaceId)),
      tasks: await db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId)),
      items: await db.select().from(items).where(eq(items.workspaceId, workspaceId)),
      stockMovements: await db.select().from(stockMovements).where(eq(stockMovements.workspaceId, workspaceId)),
      restock: await db.select().from(restockEntries).where(eq(restockEntries.workspaceId, workspaceId)),
      events: await db.select().from(events).where(eq(events.workspaceId, workspaceId)),
      bills: await db.select().from(bills).where(eq(bills.workspaceId, workspaceId)),
      expenses: await db.select().from(expenses).where(eq(expenses.workspaceId, workspaceId)),
      budgets: await db.select().from(budgets).where(eq(budgets.workspaceId, workspaceId)),
      recipes: await db.select().from(recipes).where(eq(recipes.workspaceId, workspaceId)),
      meals: await db.select().from(meals).where(eq(meals.workspaceId, workspaceId)),
      requests: await db.select().from(requests).where(eq(requests.workspaceId, workspaceId)),
      suppliers: await db.select().from(suppliers).where(eq(suppliers.workspaceId, workspaceId)),
      orders,
      orderLines: orders.length ? await db.select().from(purchaseOrderLines).where(inArray(purchaseOrderLines.orderId, orders.map((order) => order.id))) : [],
      checklists: await db.select().from(checklists).where(eq(checklists.workspaceId, workspaceId)),
      activity: await db.select().from(activity).where(eq(activity.workspaceId, workspaceId)),
    };
    return c.body(JSON.stringify(data, null, 2), 200, { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="harmony-export.json"' });
  });

  return r;
}
