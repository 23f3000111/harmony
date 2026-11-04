import { and, eq, sql } from 'drizzle-orm';
import { addDays, anchorDayOf, monthKey, addMonths, spendCategoryForItem, startOfWeek, todayIn, type DemoAccount, type Edition, type Priority, type Recurrence, type Role } from '@harmony/shared';
import type { DB } from '../db/types';
import {
  activity,
  bills,
  budgets,
  checklistRuns,
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
  users,
  workspaces,
  type ItemRow,
} from '../db/schema';
import { hashPassword } from '../security';
import { syncRestock } from '../services/stock';
import { OFFICE_CHECK, ONBOARDING, STOCK_TAKE, SUNDAY_RESET } from './starter';

export const DEMO_PASSWORD = 'Harmony!2026';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'aisyah@example.com', name: 'Aisyah Rahman', role: 'Runs the home', edition: 'home', blurb: 'Meals, shopping, bills and chores for a family of five.' },
  { email: 'siti@example.com', name: 'Siti Aminah', role: 'Family helper', edition: 'home', blurb: 'Sees today’s jobs and the shopping list, and no money.' },
  { email: 'priya@example.com', name: 'Priya Nair', role: 'HR manager', edition: 'people', blurb: 'Delegates office jobs and keeps the pantry stocked.' },
  { email: 'hafiz@example.com', name: 'Hafiz Osman', role: 'Staff member', edition: 'people', blurb: 'Picks up jobs and asks for what the office needs.' },
  { email: 'daniel@example.com', name: 'Daniel Tan', role: 'Procurement manager', edition: 'supply', blurb: 'Approves requests and tracks every purchase order.' },
  { email: 'chloe@example.com', name: 'Chloe Wong', role: 'Requester', edition: 'supply', blurb: 'Raises purchase requests for the operations team.' },
  { email: 'alex@example.com', name: 'Alex Lee', role: 'Sees all three', edition: 'all', blurb: 'One login across the home, HR and procurement editions.' },
];

const EXTRA_USERS = [{ email: 'farid@example.com', name: 'Farid Rahman' }];

const TIMEZONE = 'Asia/Kuala_Lumpur';
const DAY = 86_400_000;

function createRng(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!,
  };
}
type Rng = ReturnType<typeof createRng>;

interface Seed {
  db: DB;
  now: Date;
  today: string;
  rng: Rng;
  userIds: Map<string, string>;
}

/** A local time in the workspace's zone, never later than the present. */
function at(seed: Seed, date: string, hour = 9, minute = 0): Date {
  const moment = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`);
  return moment > seed.now ? new Date(seed.now.getTime() - 60_000) : moment;
}

async function chunkedInsert<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>, size = 200) {
  for (let index = 0; index < rows.length; index += size) await insert(rows.slice(index, index + size));
}

interface PersonSeed {
  key: string;
  name: string;
  role: Role;
  title: string;
  department?: string;
  email?: string;
  phone?: string;
}

async function createWorkspace(seed: Seed, name: string, edition: Edition, people: PersonSeed[]) {
  const [workspace] = await seed.db
    .insert(workspaces)
    .values({ name, edition, currency: 'MYR', timezone: TIMEZONE, isDemo: true, createdAt: seed.now })
    .returning();
  const ids = new Map<string, string>();
  for (const person of people) {
    const [member] = await seed.db
      .insert(members)
      .values({
        workspaceId: workspace!.id,
        userId: person.email ? seed.userIds.get(person.email) : null,
        name: person.name,
        role: person.role,
        title: person.title,
        department: person.department,
        phone: person.phone,
      })
      .returning({ id: members.id });
    ids.set(person.key, member!.id);
  }
  return { workspace: workspace!, ids };
}

interface StockSeed {
  name: string;
  category: string;
  unit: string;
  location: string;
  qty: number;
  min: number;
  target: number;
  cost: number;
  /** Units used per day, which drives the run-out forecast. */
  use?: number;
  expires?: number;
  supplier?: string;
}

async function addItems(seed: Seed, workspaceId: string, stock: StockSeed[], people: string[], supplierIds: Map<string, string> = new Map(), restockReason = 'restocked') {
  const rows = await seed.db
    .insert(items)
    .values(
      stock.map((row) => ({
        workspaceId,
        name: row.name,
        category: row.category,
        unit: row.unit,
        location: row.location,
        quantity: row.qty,
        minQty: row.min,
        targetQty: row.target,
        unitCostCents: row.cost,
        supplierId: row.supplier ? supplierIds.get(row.supplier) : null,
        expiresOn: row.expires === undefined ? null : addDays(seed.today, row.expires),
      })),
    )
    .returning();

  const moves: (typeof stockMovements.$inferInsert)[] = [];
  rows.forEach((item, index) => {
    const rate = stock[index]!.use;
    if (!rate) return;
    const whole = !['kg', 'L'].includes(item.unit);
    const interval = rate >= 1 ? 1 : Math.max(1, Math.ceil(1 / rate));
    let quantity = item.quantity;
    const target = item.targetQty ?? item.quantity * 2;
    // Walks back from today's level, so the history always adds up to what the shelf shows now.
    for (let daysAgo = seed.rng.int(0, Math.max(0, interval - 1)); daysAgo < 60; daysAgo += interval) {
      const amount = whole ? Math.max(1, Math.round(rate * interval)) : Math.round(rate * interval * 100) / 100;
      const date = addDays(seed.today, -daysAgo);
      moves.push({ workspaceId, itemId: item.id, delta: -amount, reason: 'used', memberId: seed.rng.pick(people), createdAt: at(seed, date, seed.rng.int(8, 20), seed.rng.int(0, 59)) });
      quantity += amount;
      if (quantity > target) {
        const delivered = whole ? Math.max(1, Math.round(target * 0.75)) : Math.round(target * 75) / 100;
        moves.push({ workspaceId, itemId: item.id, delta: delivered, reason: restockReason, memberId: seed.rng.pick(people), createdAt: at(seed, date, 7, 30) });
        quantity -= delivered;
      }
    }
  });
  await chunkedInsert(moves, (chunk) => seed.db.insert(stockMovements).values(chunk));
  for (const item of rows) await syncRestock(seed.db, item as ItemRow, null);
  return new Map(rows.map((row) => [row.name, row]));
}

interface TaskSeed {
  title: string;
  area: string;
  who?: string;
  due: number;
  priority?: Priority;
  repeat?: Recurrence;
  minutes?: number;
  done?: string;
  doing?: boolean;
  notes?: string;
}

async function addTasks(seed: Seed, workspaceId: string, ids: Map<string, string>, rows: TaskSeed[], createdBy: string) {
  await seed.db.insert(tasks).values(
    rows.map((row) => {
      const dueOn = addDays(seed.today, row.due);
      return {
        workspaceId,
        title: row.title,
        area: row.area,
        notes: row.notes,
        assigneeId: row.who ? ids.get(row.who) : null,
        createdById: ids.get(createdBy),
        dueOn,
        priority: row.priority ?? 'normal',
        status: row.done ? ('done' as const) : row.doing ? ('doing' as const) : ('todo' as const),
        recurrence: row.repeat ?? 'none',
        anchorDay: anchorDayOf(dueOn),
        estimatedMinutes: row.minutes,
        completedAt: row.done ? at(seed, seed.today, seed.rng.int(7, 11), seed.rng.int(0, 59)) : null,
        completedById: row.done ? ids.get(row.done) : null,
      };
    }),
  );
}

/** Ten weeks of finished work, so the charts have honest history to draw from. */
async function addTaskHistory(seed: Seed, workspaceId: string, ids: Map<string, string>, people: string[], pool: [string, string, number][], perWeek: [number, number]) {
  const rows: (typeof tasks.$inferInsert)[] = [];
  const thisWeek = startOfWeek(seed.today);
  for (let week = 0; week <= 9; week += 1) {
    const count = seed.rng.int(perWeek[0], perWeek[1]);
    for (let index = 0; index < count; index += 1) {
      const date = addDays(thisWeek, -7 * week + seed.rng.int(0, 6));
      if (date >= seed.today) continue;
      const [title, area, minutes] = seed.rng.pick(pool);
      const who = ids.get(seed.rng.pick(people))!;
      const skipped = seed.rng.next() < 0.05;
      const moment = at(seed, date, seed.rng.int(8, 21), seed.rng.int(0, 59));
      rows.push({
        workspaceId,
        title,
        area,
        assigneeId: who,
        dueOn: date,
        status: skipped ? 'skipped' : 'done',
        completedAt: skipped ? null : moment,
        completedById: skipped ? null : who,
        estimatedMinutes: minutes,
        createdAt: moment,
        updatedAt: moment,
      });
    }
  }
  await chunkedInsert(rows, (chunk) => seed.db.insert(tasks).values(chunk));
}

interface BillSeed {
  name: string;
  provider?: string;
  category: string;
  cost: number;
  due: number;
  repeat?: Recurrence;
  method?: string;
}

/** Past months appear as paid bills with their matching expenses. Only the next one is still due. */
async function addBills(seed: Seed, workspaceId: string, rows: BillSeed[]) {
  for (const row of rows) {
    const dueOn = addDays(seed.today, row.due);
    const recurrence = row.repeat ?? 'monthly';
    const anchorDay = anchorDayOf(dueOn);
    await seed.db.insert(bills).values({
      workspaceId,
      name: row.name,
      provider: row.provider,
      category: row.category,
      amountCents: row.cost,
      dueOn,
      recurrence,
      anchorDay,
      paymentMethod: row.method,
    });
    if (recurrence !== 'monthly') continue;
    for (let back = 1; back <= 6; back += 1) {
      const pastDue = addMonths(dueOn, -back, anchorDay ?? undefined);
      if (pastDue > seed.today) continue;
      const amount = Math.round(row.cost * (0.9 + seed.rng.next() * 0.2));
      const [expense] = await seed.db
        .insert(expenses)
        .values({ workspaceId, title: row.name, category: row.category, amountCents: amount, spentOn: pastDue, paymentMethod: row.method, source: 'bill' })
        .returning({ id: expenses.id });
      await seed.db.insert(bills).values({
        workspaceId,
        name: row.name,
        provider: row.provider,
        category: row.category,
        amountCents: amount,
        dueOn: pastDue,
        recurrence,
        anchorDay,
        paymentMethod: row.method,
        status: 'paid',
        paidOn: pastDue,
        expenseId: expense!.id,
      });
    }
  }
}

/** [category, monthly average in sen, entries per month, descriptions] */
type SpendPlan = [string, number, number, string[]];

async function addExpenseHistory(seed: Seed, workspaceId: string, plan: SpendPlan[], people: string[], ids: Map<string, string>) {
  const rows: (typeof expenses.$inferInsert)[] = [];
  const currentMonth = monthKey(seed.today);
  for (let back = 0; back <= 5; back += 1) {
    const month = monthKey(addMonths(`${currentMonth}-15`, -back));
    for (const [category, average, count, titles] of plan) {
      for (let index = 0; index < count; index += 1) {
        const date = `${month}-${String(seed.rng.int(1, 27)).padStart(2, '0')}`;
        if (date > seed.today) continue;
        rows.push({
          workspaceId,
          title: seed.rng.pick(titles),
          category,
          amountCents: Math.round((average / count) * (0.7 + seed.rng.next() * 0.6)),
          spentOn: date,
          source: 'manual',
          memberId: ids.get(seed.rng.pick(people)),
        });
      }
    }
  }
  await chunkedInsert(rows, (chunk) => seed.db.insert(expenses).values(chunk));
}

async function addActivity(seed: Seed, workspaceId: string, ids: Map<string, string>, names: Map<string, string>, rows: [string, string, string, number][]) {
  await seed.db.insert(activity).values(
    rows.map(([who, summary, objectType, minutesAgo]) => ({
      workspaceId,
      actorId: ids.get(who),
      actorName: names.get(who),
      summary,
      objectType,
      createdAt: new Date(seed.now.getTime() - minutesAgo * 60_000),
    })),
  );
}

async function addChecklist(
  seed: Seed,
  workspaceId: string,
  checklist: { name: string; description: string; cadence: 'weekly' | 'monthly' | 'once'; steps: { id: string; title: string; hint: string | null }[]; position: number },
  periodKey: string,
  doneIds: string[],
  doneBy: string,
) {
  const [row] = await seed.db.insert(checklists).values({ workspaceId, ...checklist }).returning({ id: checklists.id });
  if (doneIds.length) {
    const done = Object.fromEntries(doneIds.map((id, index) => [id, { memberName: doneBy, at: new Date(seed.now.getTime() - (index + 1) * 3_600_000).toISOString() }]));
    await seed.db.insert(checklistRuns).values({ checklistId: row!.id, periodKey, done });
  }
}

function isoWeek(date: string) {
  const thursday = addDays(startOfWeek(date), 3);
  const year = thursday.slice(0, 4);
  const week = Math.floor((new Date(`${thursday}T00:00:00Z`).getTime() - new Date(`${year}-01-01T00:00:00Z`).getTime()) / DAY / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

async function seedHome(seed: Seed) {
  const people: PersonSeed[] = [
    { key: 'aisyah', name: 'Aisyah Rahman', role: 'owner', title: 'Mum', email: 'aisyah@example.com' },
    { key: 'farid', name: 'Farid Rahman', role: 'manager', title: 'Dad', email: 'farid@example.com' },
    { key: 'alex', name: 'Alex Lee', role: 'manager', title: 'Relative', email: 'alex@example.com' },
    { key: 'siti', name: 'Siti Aminah', role: 'member', title: 'Helper', email: 'siti@example.com' },
    { key: 'adam', name: 'Adam Rahman', role: 'member', title: 'Son, 13' },
    { key: 'hana', name: 'Hana Rahman', role: 'member', title: 'Daughter, 9' },
  ];
  const { workspace, ids } = await createWorkspace(seed, 'The Rahman home', 'home', people);
  const names = new Map(people.map((person) => [person.key, person.name]));
  const memberIds = ['aisyah', 'farid', 'siti', 'adam'].map((key) => ids.get(key)!);

  await addItems(
    seed,
    workspace.id,
    [
      { name: 'Jasmine rice', category: 'Rice & grains', unit: 'kg', location: 'Pantry', qty: 3.5, min: 2, target: 10, cost: 450, use: 0.35 },
      { name: 'Cooking oil', category: 'Pantry', unit: 'bottle', location: 'Pantry', qty: 1, min: 1, target: 3, cost: 1290, use: 0.06 },
      { name: 'Eggs', category: 'Dairy & eggs', unit: 'pcs', location: 'Fridge', qty: 9, min: 6, target: 30, cost: 55, use: 1.6 },
      { name: 'UHT milk', category: 'Dairy & eggs', unit: 'carton', location: 'Fridge', qty: 2, min: 2, target: 6, cost: 720, use: 0.4 },
      { name: 'Greek yogurt', category: 'Dairy & eggs', unit: 'tub', location: 'Fridge', qty: 2, min: 1, target: 3, cost: 1450, use: 0.12 },
      { name: 'Teh tarik sachets', category: 'Drinks', unit: 'box', location: 'Pantry', qty: 3, min: 1, target: 4, cost: 1590, use: 0.08 },
      { name: 'Ground coffee', category: 'Drinks', unit: 'pack', location: 'Pantry', qty: 2, min: 1, target: 3, cost: 1250, use: 0.05 },
      { name: 'Sugar', category: 'Pantry', unit: 'kg', location: 'Pantry', qty: 2, min: 1, target: 3, cost: 300, use: 0.05 },
      { name: 'Coconut milk', category: 'Pantry', unit: 'pack', location: 'Pantry', qty: 5, min: 2, target: 8, cost: 350, use: 0.15 },
      { name: 'Sambal paste', category: 'Pantry', unit: 'jar', location: 'Pantry', qty: 2, min: 1, target: 3, cost: 850, use: 0.06 },
      { name: 'Ikan bilis', category: 'Pantry', unit: 'pack', location: 'Freezer', qty: 1, min: 1, target: 2, cost: 1800, use: 0.03 },
      { name: 'Chicken', category: 'Meat & seafood', unit: 'kg', location: 'Freezer', qty: 2.5, min: 2, target: 6, cost: 1100, use: 0.3 },
      { name: 'Salmon fillet', category: 'Meat & seafood', unit: 'pack', location: 'Freezer', qty: 2, min: 1, target: 4, cost: 3200, use: 0.1 },
      { name: 'Prawns', category: 'Meat & seafood', unit: 'pack', location: 'Freezer', qty: 1, min: 1, target: 3, cost: 2800, use: 0.07 },
      { name: 'Onions', category: 'Fresh food', unit: 'kg', location: 'Pantry', qty: 1.5, min: 0.5, target: 2, cost: 450, use: 0.1 },
      { name: 'Garlic', category: 'Fresh food', unit: 'pack', location: 'Fridge', qty: 1, min: 1, target: 2, cost: 400, use: 0.08 },
      { name: 'Baby spinach', category: 'Fresh food', unit: 'pack', location: 'Fridge', qty: 1, min: 0, target: 2, cost: 650, expires: 1 },
      { name: 'Avocados', category: 'Fresh food', unit: 'pcs', location: 'Fridge', qty: 2, min: 0, target: 4, cost: 590, expires: 0 },
      { name: 'Sourdough loaf', category: 'Fresh food', unit: 'loaf', location: 'Pantry', qty: 1, min: 0, target: 1, cost: 1290, expires: 2 },
      { name: 'Fresh milk', category: 'Dairy & eggs', unit: 'carton', location: 'Fridge', qty: 1, min: 0, target: 2, cost: 890, expires: 3 },
      { name: 'Dishwashing liquid', category: 'Cleaning', unit: 'bottle', location: 'Cleaning cupboard', qty: 1, min: 1, target: 3, cost: 1150, use: 0.04 },
      { name: 'Laundry detergent', category: 'Cleaning', unit: 'bottle', location: 'Laundry', qty: 2, min: 1, target: 3, cost: 2290, use: 0.05 },
      { name: 'Floor cleaner', category: 'Cleaning', unit: 'bottle', location: 'Cleaning cupboard', qty: 2, min: 1, target: 2, cost: 1390, use: 0.03 },
      { name: 'Toilet rolls', category: 'Personal care', unit: 'roll', location: 'Bathroom', qty: 9, min: 6, target: 24, cost: 120, use: 0.7 },
      { name: 'Hand soap', category: 'Personal care', unit: 'bottle', location: 'Bathroom', qty: 3, min: 1, target: 3, cost: 690, use: 0.05 },
    ],
    memberIds,
  );

  await seed.db.insert(restockEntries).values([
    { workspaceId: workspace.id, name: 'Birthday candles', quantity: 1, unit: 'pack', estCostCents: 450, source: 'manual', addedById: ids.get('aisyah') },
    { workspaceId: workspace.id, name: 'Fresh dill and lemons', quantity: 1, unit: 'bunch', estCostCents: 800, source: 'meal', addedById: ids.get('siti') },
  ]);

  await addTasks(
    seed,
    workspace.id,
    ids,
    [
      { title: 'Wipe counters and unload the dishwasher', area: 'Kitchen', who: 'siti', due: 0, repeat: 'daily', minutes: 15, done: 'siti' },
      { title: 'Check school bags and water bottles', area: 'School', who: 'adam', due: 0, repeat: 'weekdays', minutes: 5, done: 'adam' },
      { title: 'Run a load of towels and hang to dry', area: 'Laundry', who: 'siti', due: 0, repeat: 'weekly', minutes: 20 },
      { title: 'Take out the kitchen recycling before 8 PM', area: 'Kitchen', who: 'adam', due: 0, priority: 'high', repeat: 'weekly', minutes: 5 },
      { title: 'Defrost the salmon by 4 PM', area: 'Kitchen', who: 'siti', due: 0, priority: 'high', minutes: 2 },
      { title: 'Feed the cat and clean the bowl', area: 'Other', who: 'hana', due: 0, repeat: 'daily', minutes: 5 },
      { title: 'Sign Hana’s school trip form', area: 'School', who: 'aisyah', due: 0, minutes: 5 },
      { title: 'Call the plumber about the kitchen tap', area: 'Home upkeep', who: 'farid', due: -2, priority: 'high', minutes: 10 },
      { title: 'Book the car service', area: 'Home upkeep', who: 'farid', due: -1, minutes: 10 },
      { title: 'Scrub the bathrooms', area: 'Bathrooms', who: 'siti', due: 1, repeat: 'weekly', minutes: 30 },
      { title: 'Change bed sheets', area: 'Bedrooms', who: 'siti', due: 2, repeat: 'fortnightly', minutes: 20 },
      { title: 'Vacuum the living room', area: 'Floors', who: 'adam', due: 2, repeat: 'weekly', minutes: 20 },
      { title: 'Water the balcony plants', area: 'Outdoor', who: 'hana', due: 3, repeat: 'weekly', minutes: 5 },
      { title: 'Clean out the fridge', area: 'Kitchen', who: 'aisyah', due: 4, repeat: 'monthly', minutes: 30 },
      { title: 'Clean the washing machine drum', area: 'Home upkeep', who: 'siti', due: 5, repeat: 'monthly', minutes: 15 },
      { title: 'Pack gifts for the family dinner', area: 'Other', who: 'aisyah', due: 6, minutes: 20 },
      { title: 'Sweep and mop the kitchen floor', area: 'Floors', who: 'siti', due: 6, repeat: 'weekly', minutes: 20 },
      { title: 'Dust shelves and the TV area', area: 'Living areas', who: 'farid', due: 8, repeat: 'weekly', minutes: 15 },
      { title: 'Service the air conditioners', area: 'Home upkeep', who: 'farid', due: 11, repeat: 'quarterly', priority: 'high', minutes: 60 },
      { title: 'Replace the water filter', area: 'Home upkeep', who: 'farid', due: 26, repeat: 'half_yearly', minutes: 15 },
    ],
    'aisyah',
  );

  await addTaskHistory(
    seed,
    workspace.id,
    ids,
    ['siti', 'siti', 'adam', 'hana', 'aisyah', 'farid'],
    [
      ['Wipe kitchen counters', 'Kitchen', 5],
      ['Run a load of laundry', 'Laundry', 10],
      ['Vacuum the living room', 'Floors', 20],
      ['Scrub the bathrooms', 'Bathrooms', 30],
      ['Water the balcony plants', 'Outdoor', 5],
      ['Take out the rubbish', 'Kitchen', 5],
      ['Fold and put away laundry', 'Laundry', 15],
      ['Change bed sheets', 'Bedrooms', 20],
    ],
    [16, 26],
  );

  const insertedRecipes = await seed.db
    .insert(recipes)
    .values([
      { workspaceId: workspace.id, name: 'Nasi lemak', prepMinutes: 20, cookMinutes: 40, serves: 5, favorite: true, ingredients: [{ name: 'Jasmine rice', qty: 1, unit: 'kg' }, { name: 'Coconut milk', qty: 2, unit: 'pack' }, { name: 'Sambal paste', qty: 1, unit: 'jar' }, { name: 'Eggs', qty: 5, unit: 'pcs' }, { name: 'Ikan bilis', qty: 1, unit: 'pack' }] },
      { workspaceId: workspace.id, name: 'Lemon herb salmon and roasted greens', prepMinutes: 15, cookMinutes: 20, serves: 5, favorite: true, notes: 'Thaw the salmon by 4 PM.', ingredients: [{ name: 'Salmon fillet', qty: 2, unit: 'pack' }, { name: 'Baby spinach', qty: 1, unit: 'pack' }, { name: 'Fresh dill and lemons', qty: 1, unit: 'bunch' }] },
      { workspaceId: workspace.id, name: 'Ayam masak merah', prepMinutes: 20, cookMinutes: 40, serves: 5, favorite: true, ingredients: [{ name: 'Chicken', qty: 1.5, unit: 'kg' }, { name: 'Onions', qty: 0.5, unit: 'kg' }, { name: 'Sambal paste', qty: 1, unit: 'jar' }] },
      { workspaceId: workspace.id, name: 'Garlic butter prawn pasta', prepMinutes: 10, cookMinutes: 15, serves: 5, ingredients: [{ name: 'Prawns', qty: 2, unit: 'pack' }, { name: 'Garlic', qty: 1, unit: 'pack' }, { name: 'Spaghetti', qty: 2, unit: 'pack' }] },
      { workspaceId: workspace.id, name: 'Sup sayur and telur dadar', prepMinutes: 10, cookMinutes: 20, serves: 5, ingredients: [{ name: 'Eggs', qty: 4, unit: 'pcs' }, { name: 'Onions', qty: 0.25, unit: 'kg' }] },
      { workspaceId: workspace.id, name: 'Flatbread pizza night', prepMinutes: 20, cookMinutes: 15, serves: 5, notes: 'The kids choose the toppings.', ingredients: [{ name: 'Flatbread', qty: 5, unit: 'pcs' }, { name: 'Cheese', qty: 1, unit: 'pack' }] },
      { workspaceId: workspace.id, name: 'Slow-cooker beef stew', prepMinutes: 15, cookMinutes: 360, serves: 5, ingredients: [{ name: 'Stewing beef', qty: 1, unit: 'kg' }, { name: 'Onions', qty: 0.5, unit: 'kg' }] },
    ])
    .returning();
  const recipeId = new Map(insertedRecipes.map((recipe) => [recipe.name, recipe.id]));

  const week = startOfWeek(seed.today);
  const dinners = ['Nasi lemak', 'Lemon herb salmon and roasted greens', 'Slow-cooker beef stew', 'Garlic butter prawn pasta', 'Flatbread pizza night', 'Ayam masak merah', 'Sup sayur and telur dadar'];
  const lunches = ['Leftover nasi lemak', 'Avocado toast and boiled eggs', 'Hummus wraps', 'Stew with crusty bread', 'Salad with tuna', 'Cafe brunch', 'Leftover buffet'];
  // Tonight's dinner always uses today's ingredients, whichever day the demo opens.
  const todayIndex = (new Date(`${seed.today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const rotated = [...dinners];
  const salmon = rotated.indexOf('Lemon herb salmon and roasted greens');
  [rotated[salmon], rotated[todayIndex]] = [rotated[todayIndex]!, rotated[salmon]!];

  const mealRows: (typeof meals.$inferInsert)[] = [];
  rotated.forEach((title, index) => {
    mealRows.push({ workspaceId: workspace.id, date: addDays(week, index), slot: 'dinner', title, recipeId: recipeId.get(title) });
    mealRows.push({ workspaceId: workspace.id, date: addDays(week, index), slot: 'lunch', title: lunches[index]! });
  });
  ['Ayam masak merah', 'Nasi lemak', 'Sup sayur and telur dadar', 'Garlic butter prawn pasta'].forEach((title, index) => {
    mealRows.push({ workspaceId: workspace.id, date: addDays(week, 7 + index), slot: 'dinner', title, recipeId: recipeId.get(title) });
  });
  await seed.db.insert(meals).values(mealRows);

  await addBills(seed, workspace.id, [
    { name: 'Home internet', provider: 'Unifi', category: 'Utilities', cost: 13900, due: 1, method: 'Auto-debit' },
    { name: 'Tuition fees', provider: 'Bright Minds Centre', category: 'Education', cost: 42000, due: 3, method: 'Online banking' },
    { name: 'Electricity', provider: 'TNB', category: 'Utilities', cost: 18500, due: 6, method: 'Online banking' },
    { name: 'Water', provider: 'Air Selangor', category: 'Utilities', cost: 3200, due: 9, method: 'JomPAY' },
    { name: 'Sewerage', provider: 'IWK', category: 'Utilities', cost: 1600, due: 18, method: 'JomPAY' },
    { name: 'Condo maintenance and sinking fund', category: 'Housing', cost: 31000, due: 24, method: 'Bank transfer' },
    { name: 'Cukai pintu', provider: 'Local council', category: 'Housing', cost: 48000, due: 40, repeat: 'half_yearly', method: 'Online banking' },
    { name: 'Car insurance', category: 'Transport', cost: 185000, due: 75, repeat: 'yearly', method: 'Credit card' },
  ]);

  await addExpenseHistory(
    seed,
    workspace.id,
    [
      ['Groceries', 165000, 6, ['Weekly groceries', 'Wet market run', 'Pantry top-up']],
      ['Household supplies', 22000, 2, ['Cleaning supplies', 'Bathroom restock']],
      ['Transport', 42000, 3, ['Petrol', 'Toll top-up']],
      ['Healthcare', 15000, 1, ['Clinic visit', 'Pharmacy']],
      ['Family & festive', 26000, 2, ['Family dinner', 'Birthday gift', 'Weekend outing']],
    ],
    ['aisyah', 'farid'],
    ids,
  );
  await seed.db.insert(budgets).values(
    [
      ['Groceries', 180000],
      ['Utilities', 40000],
      ['Housing', 50000],
      ['Education', 45000],
      ['Household supplies', 25000],
      ['Transport', 45000],
      ['Healthcare', 20000],
      ['Family & festive', 30000],
    ].map(([category, amountCents]) => ({ workspaceId: workspace.id, category: category as string, amountCents: amountCents as number })),
  );

  await seed.db.insert(events).values([
    { workspaceId: workspace.id, title: 'Parent-teacher meeting', date: addDays(seed.today, 2), time: '09:00', kind: 'school' },
    { workspaceId: workspace.id, title: 'Dentist for Hana', date: addDays(seed.today, 4), time: '16:30', kind: 'appointment' },
    { workspaceId: workspace.id, title: 'Family dinner at Tok’s', date: addDays(seed.today, 6), time: '19:00', kind: 'other' },
    { workspaceId: workspace.id, title: 'School holidays begin', date: addDays(seed.today, 16), kind: 'school' },
    { workspaceId: workspace.id, title: 'Hana’s birthday', date: addDays(seed.today, 21), kind: 'other' },
  ]);

  await addChecklist(
    seed,
    workspace.id,
    { name: 'Sunday reset', description: 'Fifteen minutes that set up the week ahead.', cadence: 'weekly', steps: SUNDAY_RESET, position: 0 },
    isoWeek(seed.today),
    ['calendar', 'meals', 'pantry', 'list'],
    'Aisyah Rahman',
  );
  await addChecklist(
    seed,
    workspace.id,
    {
      name: 'Monthly home check',
      description: 'A quick walk around the home once a month.',
      cadence: 'monthly',
      steps: [
        { id: 'filters', title: 'Check air conditioner filters', hint: null },
        { id: 'expiry', title: 'Throw out anything past its date', hint: null },
        { id: 'first-aid', title: 'Restock the first aid box', hint: null },
        { id: 'budget', title: 'Compare spending with the budget', hint: null },
      ],
      position: 1,
    },
    monthKey(seed.today),
    ['filters'],
    'Farid Rahman',
  );

  await addActivity(seed, workspace.id, ids, names, [
    ['siti', 'finished “Wipe counters and unload the dishwasher”', 'task', 38],
    ['adam', 'finished “Check school bags and water bottles”', 'task', 75],
    ['siti', 'added Fresh dill and lemons to the list', 'restock', 140],
    ['aisyah', 'planned Lemon herb salmon and roasted greens for dinner', 'meal', 260],
    ['farid', 'paid the Condo maintenance and sinking fund bill', 'bill', 1500],
    ['aisyah', 'added Birthday candles to the list', 'restock', 1620],
  ]);
}

async function seedPeople(seed: Seed) {
  const people: PersonSeed[] = [
    { key: 'priya', name: 'Priya Nair', role: 'owner', title: 'HR manager', department: 'People', email: 'priya@example.com' },
    { key: 'jason', name: 'Jason Lim', role: 'manager', title: 'Office administrator', department: 'Operations' },
    { key: 'alex', name: 'Alex Lee', role: 'manager', title: 'Operations lead', department: 'Operations', email: 'alex@example.com' },
    { key: 'nurul', name: 'Nurul Izzah', role: 'member', title: 'Receptionist', department: 'Front office' },
    { key: 'kumar', name: 'Kumar Rajan', role: 'member', title: 'Facilities assistant', department: 'Operations' },
    { key: 'meiling', name: 'Mei Ling Goh', role: 'member', title: 'Finance executive', department: 'Finance' },
    { key: 'hafiz', name: 'Hafiz Osman', role: 'member', title: 'Designer', department: 'Creative', email: 'hafiz@example.com' },
  ];
  const { workspace, ids } = await createWorkspace(seed, 'Bayu Creative', 'people', people);
  const names = new Map(people.map((person) => [person.key, person.name]));
  const memberIds = ['jason', 'nurul', 'kumar', 'hafiz'].map((key) => ids.get(key)!);

  const stock = await addItems(
    seed,
    workspace.id,
    [
      { name: 'Coffee beans', category: 'Coffee & tea', unit: 'kg', location: 'Level 3 pantry', qty: 1.2, min: 1, target: 5, cost: 6800, use: 0.28 },
      { name: '3-in-1 coffee', category: 'Coffee & tea', unit: 'box', location: 'Level 3 pantry', qty: 2, min: 2, target: 6, cost: 1590, use: 0.2 },
      { name: 'Tea bags', category: 'Coffee & tea', unit: 'box', location: 'Level 3 pantry', qty: 4, min: 1, target: 4, cost: 950, use: 0.1 },
      { name: 'Sugar sticks', category: 'Coffee & tea', unit: 'box', location: 'Level 3 pantry', qty: 3, min: 1, target: 3, cost: 1200, use: 0.05 },
      { name: 'Creamer', category: 'Coffee & tea', unit: 'tin', location: 'Level 3 pantry', qty: 2, min: 1, target: 3, cost: 1450, use: 0.09 },
      { name: 'Oat milk', category: 'Drinks', unit: 'carton', location: 'Level 3 pantry', qty: 1, min: 2, target: 6, cost: 1190, use: 0.35 },
      { name: 'Snack biscuits', category: 'Snacks', unit: 'tin', location: 'Level 5 pantry', qty: 5, min: 2, target: 6, cost: 1890, use: 0.15 },
      { name: 'Instant noodles', category: 'Snacks', unit: 'carton', location: 'Store room', qty: 1, min: 1, target: 2, cost: 3200, use: 0.03 },
      { name: 'Bottled water', category: 'Drinks', unit: 'carton', location: 'Store room', qty: 6, min: 2, target: 8, cost: 1400, use: 0.2 },
      { name: 'Paper cups', category: 'Paper goods', unit: 'sleeve', location: 'Level 3 pantry', qty: 3, min: 3, target: 10, cost: 650, use: 0.4 },
      { name: 'Tissue boxes', category: 'Paper goods', unit: 'box', location: 'Store room', qty: 14, min: 6, target: 24, cost: 280, use: 0.6 },
      { name: 'Toilet rolls', category: 'Paper goods', unit: 'carton', location: 'Cleaner cupboard', qty: 1, min: 1, target: 3, cost: 4800, use: 0.07 },
      { name: 'Hand soap refill', category: 'Cleaning', unit: 'refill', location: 'Cleaner cupboard', qty: 3, min: 1, target: 4, cost: 1850, use: 0.08 },
      { name: 'Floor cleaner', category: 'Cleaning', unit: 'bottle', location: 'Cleaner cupboard', qty: 2, min: 1, target: 3, cost: 1390, use: 0.05 },
      { name: 'Bin liners', category: 'Cleaning', unit: 'roll', location: 'Cleaner cupboard', qty: 7, min: 3, target: 10, cost: 690, use: 0.2 },
      { name: 'A4 paper', category: 'Stationery', unit: 'ream', location: 'Store room', qty: 18, min: 5, target: 25, cost: 1350, use: 0.45 },
      { name: 'Whiteboard markers', category: 'Stationery', unit: 'pack', location: 'Reception', qty: 3, min: 1, target: 4, cost: 1250, use: 0.04 },
      { name: 'Plasters', category: 'First aid', unit: 'box', location: 'Reception', qty: 1, min: 1, target: 3, cost: 850 },
      { name: 'Fresh fruit for pantry', category: 'Snacks', unit: 'basket', location: 'Level 5 pantry', qty: 1, min: 0, target: 2, cost: 3500, expires: 2 },
    ],
    memberIds,
  );

  await addTasks(
    seed,
    workspace.id,
    ids,
    [
      { title: 'Prepare the onboarding pack for the new designer', area: 'Onboarding', who: 'nurul', due: 0, priority: 'high', minutes: 45, doing: true },
      { title: 'Inspect washrooms and restock', area: 'Cleaning', who: 'kumar', due: 0, repeat: 'daily', minutes: 10, done: 'kumar' },
      { title: 'Clear meeting rooms at end of day', area: 'Cleaning', who: 'kumar', due: 0, repeat: 'weekdays', minutes: 10 },
      { title: 'Order flowers for reception', area: 'Admin', who: 'nurul', due: 0, minutes: 10, done: 'nurul' },
      { title: 'Update the leave calendar for December', area: 'Admin', who: 'meiling', due: 0, minutes: 20 },
      { title: 'Book a contractor for the leaking aircon in meeting room 2', area: 'Facilities', who: 'jason', due: -3, priority: 'high', minutes: 15 },
      { title: 'Submit the quarterly pantry spend to finance', area: 'Admin', who: 'jason', due: -1, minutes: 30 },
      { title: 'Design the year-end party poster', area: 'Staff events', who: 'hafiz', due: 1, minutes: 90 },
      { title: 'Confirm caterer for the potluck', area: 'Staff events', who: 'nurul', due: 2, minutes: 15 },
      { title: 'Check the pantry and update stock', area: 'Facilities', who: 'kumar', due: 2, repeat: 'weekly', minutes: 15 },
      { title: 'Prepare a desk for the new designer', area: 'Onboarding', who: 'kumar', due: 3, minutes: 30 },
      { title: 'Monthly fire extinguisher check', area: 'Compliance', who: 'kumar', due: 5, repeat: 'monthly', minutes: 20 },
      { title: 'Prepare the monthly staff birthday list', area: 'Staff events', who: 'nurul', due: 7, repeat: 'monthly', minutes: 15 },
      { title: 'Print new fire-exit floor plans', area: 'Compliance', who: 'hafiz', due: 8, minutes: 30 },
      { title: 'Renew the pest control contract', area: 'Facilities', who: 'jason', due: 10, repeat: 'yearly', minutes: 30 },
      { title: 'Service the air conditioners', area: 'Facilities', who: 'jason', due: 12, repeat: 'quarterly', minutes: 60 },
      { title: 'Restock the first aid box', area: 'Compliance', due: 13, repeat: 'quarterly', minutes: 15 },
      { title: 'Draft the December all-hands agenda', area: 'Admin', due: 15, minutes: 30 },
    ],
    'priya',
  );

  await addTaskHistory(
    seed,
    workspace.id,
    ids,
    ['kumar', 'kumar', 'nurul', 'nurul', 'jason', 'hafiz', 'meiling'],
    [
      ['Inspect washrooms and restock', 'Cleaning', 10],
      ['Clear meeting rooms at end of day', 'Cleaning', 10],
      ['Check the pantry and update stock', 'Facilities', 15],
      ['Sort incoming mail', 'Admin', 10],
      ['Replace printer paper', 'Admin', 5],
      ['Set up the town hall room', 'Staff events', 30],
    ],
    [14, 24],
  );

  const coffee = stock.get('Coffee beans')!;
  const insertRequests: (typeof requests.$inferInsert)[] = [
    {
      workspaceId: workspace.id,
      kind: 'supply',
      title: 'We’re nearly out of oat milk',
      details: 'A lot of the team switched this month. Could we double the usual order?',
      priority: 'normal',
      requestedById: ids.get('hafiz'),
      createdAt: new Date(seed.now.getTime() - 2 * 3_600_000),
      lines: [{ name: 'Oat milk', qty: 6, unit: 'carton', unitCostCents: 1190, itemId: stock.get('Oat milk')!.id }],
      estimatedCents: 7140,
    },
    {
      workspaceId: workspace.id,
      kind: 'repair',
      title: 'Aircon in meeting room 2 is leaking again',
      details: 'Water dripping onto the side table during this morning’s client call.',
      priority: 'high',
      neededBy: addDays(seed.today, 1),
      requestedById: ids.get('nurul'),
      createdAt: new Date(seed.now.getTime() - 20 * 3_600_000),
    },
    {
      workspaceId: workspace.id,
      kind: 'other',
      title: 'Standing desk for the design corner',
      details: 'Physio recommended it after the back strain in September.',
      requestedById: ids.get('hafiz'),
      createdAt: new Date(seed.now.getTime() - 48 * 3_600_000),
      estimatedCents: 129000,
      lines: [{ name: 'Standing desk', qty: 1, unit: 'pcs', unitCostCents: 129000 }],
    },
    {
      workspaceId: workspace.id,
      kind: 'supply',
      title: 'More coffee beans for the level 3 machine',
      status: 'approved',
      requestedById: ids.get('meiling'),
      decidedById: ids.get('priya'),
      decidedAt: new Date(seed.now.getTime() - 3 * DAY),
      lines: [{ name: 'Coffee beans', qty: 4, unit: 'kg', unitCostCents: 6800, itemId: coffee.id }],
      estimatedCents: 27200,
      createdAt: new Date(seed.now.getTime() - 4 * DAY),
    },
    {
      workspaceId: workspace.id,
      kind: 'other',
      title: 'Bean bags for the breakout area',
      status: 'rejected',
      decisionNote: 'Not this quarter. We can look again in January.',
      requestedById: ids.get('hafiz'),
      decidedById: ids.get('priya'),
      decidedAt: new Date(seed.now.getTime() - 9 * DAY),
      estimatedCents: 96000,
      createdAt: new Date(seed.now.getTime() - 11 * DAY),
    },
  ];
  await seed.db.insert(requests).values(insertRequests);

  await addBills(seed, workspace.id, [
    { name: 'Office cleaning contract', provider: 'BersihPro Services', category: 'Cleaning', cost: 180000, due: 5, method: 'Bank transfer' },
    { name: 'Water dispenser rental', provider: 'PureFlow', category: 'Utilities', cost: 12000, due: 9, method: 'Auto-debit' },
    { name: 'Internet line', provider: 'TIME', category: 'Utilities', cost: 45000, due: 14, method: 'Auto-debit' },
    { name: 'Pest control', provider: 'SafeGuard Pest', category: 'Repairs & servicing', cost: 38000, due: 25, repeat: 'quarterly', method: 'Bank transfer' },
    { name: 'Air conditioner servicing', provider: 'CoolAir Works', category: 'Repairs & servicing', cost: 96000, due: 40, repeat: 'quarterly', method: 'Bank transfer' },
  ]);

  await addExpenseHistory(
    seed,
    workspace.id,
    [
      ['Pantry', 165000, 5, ['Coffee and tea top-up', 'Snacks for the pantry', 'Oat milk order', 'Fruit basket']],
      ['Stationery', 42000, 2, ['A4 paper', 'Whiteboard markers', 'Printer supplies']],
      ['Staff events', 75000, 2, ['Team lunch', 'Birthday cake', 'Town hall refreshments']],
      ['Repairs & servicing', 40000, 1, ['Door lock repair', 'Light fittings', 'Aircon top-up']],
      ['Cleaning', 28000, 2, ['Cleaning supplies', 'Bin liners and soap']],
    ],
    ['jason', 'priya'],
    ids,
  );
  await seed.db.insert(budgets).values(
    [
      ['Pantry', 180000],
      ['Cleaning', 220000],
      ['Stationery', 50000],
      ['Repairs & servicing', 90000],
      ['Utilities', 60000],
      ['Staff events', 90000],
    ].map(([category, amountCents]) => ({ workspaceId: workspace.id, category: category as string, amountCents: amountCents as number })),
  );

  await seed.db.insert(events).values([
    { workspaceId: workspace.id, title: 'Town hall', date: addDays(seed.today, 2), time: '15:00', kind: 'meeting' },
    { workspaceId: workspace.id, title: 'New designer starts', date: addDays(seed.today, 5), time: '09:00', kind: 'other', notes: 'Desk and laptop ready the day before.' },
    { workspaceId: workspace.id, title: 'Fire drill', date: addDays(seed.today, 9), time: '11:00', kind: 'other' },
    { workspaceId: workspace.id, title: 'Year-end potluck', date: addDays(seed.today, 18), time: '12:30', kind: 'other' },
  ]);

  await addChecklist(
    seed,
    workspace.id,
    { name: 'Monthly office check', description: 'A short review that sets up the month ahead.', cadence: 'monthly', steps: OFFICE_CHECK, position: 0 },
    monthKey(seed.today),
    ['stock', 'budget'],
    'Priya Nair',
  );
  await addChecklist(
    seed,
    workspace.id,
    { name: 'New joiner onboarding', description: 'Everything a new starter needs before and on day one.', cadence: 'once', steps: ONBOARDING, position: 1 },
    'once',
    ['welcome', 'buddy'],
    'Nurul Izzah',
  );

  await addActivity(seed, workspace.id, ids, names, [
    ['kumar', 'finished “Inspect washrooms and restock”', 'task', 25],
    ['hafiz', 'asked for “We’re nearly out of oat milk”', 'request', 120],
    ['nurul', 'finished “Order flowers for reception”', 'task', 210],
    ['nurul', 'asked for “Aircon in meeting room 2 is leaking again”', 'request', 1200],
    ['priya', 'approved “More coffee beans for the level 3 machine”', 'request', 4320],
  ]);
}

async function seedSupply(seed: Seed) {
  const people: PersonSeed[] = [
    { key: 'daniel', name: 'Daniel Tan', role: 'owner', title: 'Procurement manager', department: 'Procurement', email: 'daniel@example.com' },
    { key: 'aina', name: 'Aina Zulkifli', role: 'manager', title: 'Finance approver', department: 'Finance' },
    { key: 'alex', name: 'Alex Lee', role: 'manager', title: 'Category buyer', department: 'Procurement', email: 'alex@example.com' },
    { key: 'ravi', name: 'Ravi Menon', role: 'member', title: 'Store keeper', department: 'Warehouse' },
    { key: 'chloe', name: 'Chloe Wong', role: 'member', title: 'Operations executive', department: 'Operations', email: 'chloe@example.com' },
  ];
  const { workspace, ids } = await createWorkspace(seed, 'Mutiara Bakehouse', 'supply', people);
  const names = new Map(people.map((person) => [person.key, person.name]));

  const supplierRows = await seed.db
    .insert(suppliers)
    .values([
      { workspaceId: workspace.id, name: 'Mesra Packaging', contactName: 'Azlan Hamid', email: 'sales@mesra-packaging.example.com', phone: '03-5555 0101', category: 'Packaging', paymentTermsDays: 30, leadTimeDays: 7 },
      { workspaceId: workspace.id, name: 'BersihPro Hygiene', contactName: 'Grace Yap', email: 'orders@bersihpro.example.com', phone: '03-5555 0102', category: 'Cleaning', paymentTermsDays: 30, leadTimeDays: 3 },
      { workspaceId: workspace.id, name: 'KopiKita Supply', contactName: 'Zul Ariffin', email: 'hello@kopikita.example.com', phone: '03-5555 0103', category: 'Pantry', paymentTermsDays: 14, leadTimeDays: 2 },
      { workspaceId: workspace.id, name: 'Papertrail Stationery', contactName: 'Janet Ong', email: 'sales@papertrail.example.com', phone: '03-5555 0104', category: 'Stationery', paymentTermsDays: 30, leadTimeDays: 2 },
      { workspaceId: workspace.id, name: 'SafeHands PPE', contactName: 'Vikram Pillai', email: 'orders@safehands.example.com', phone: '03-5555 0105', category: 'Safety', paymentTermsDays: 45, leadTimeDays: 5 },
      { workspaceId: workspace.id, name: 'Teknik Spares', contactName: 'Ong Wei Jie', email: 'parts@tekniks.example.com', phone: '03-5555 0106', category: 'Spare parts', paymentTermsDays: 60, leadTimeDays: 10 },
    ])
    .returning();
  const supplierIds = new Map(supplierRows.map((row) => [row.name, row.id]));
  const reliability = new Map([
    ['Mesra Packaging', 0.55],
    ['BersihPro Hygiene', 0.9],
    ['KopiKita Supply', 0.95],
    ['Papertrail Stationery', 0.85],
    ['SafeHands PPE', 0.75],
    ['Teknik Spares', 0.65],
  ]);

  const stock = await addItems(
    seed,
    workspace.id,
    [
      { name: 'Kraft boxes (small)', category: 'Packaging', unit: 'bundle', location: 'Warehouse A', qty: 14, min: 10, target: 50, cost: 3800, use: 1.4, supplier: 'Mesra Packaging' },
      { name: 'Kraft boxes (medium)', category: 'Packaging', unit: 'bundle', location: 'Warehouse A', qty: 22, min: 8, target: 40, cost: 4500, use: 0.8, supplier: 'Mesra Packaging' },
      { name: 'Food-grade liners', category: 'Packaging', unit: 'roll', location: 'Warehouse A', qty: 6, min: 6, target: 24, cost: 5200, use: 0.5, supplier: 'Mesra Packaging' },
      { name: 'Cake boards', category: 'Packaging', unit: 'pack', location: 'Warehouse A', qty: 30, min: 10, target: 40, cost: 2200, use: 0.6, supplier: 'Mesra Packaging' },
      { name: 'Packing tape', category: 'Packaging', unit: 'carton', location: 'Main store', qty: 3, min: 1, target: 4, cost: 9600, use: 0.06, supplier: 'Mesra Packaging' },
      { name: 'Shipping labels', category: 'Packaging', unit: 'roll', location: 'Main store', qty: 9, min: 4, target: 15, cost: 1800, use: 0.3, supplier: 'Mesra Packaging' },
      { name: 'Floor degreaser', category: 'Cleaning', unit: 'can', location: 'Main store', qty: 2, min: 2, target: 6, cost: 5600, use: 0.15, supplier: 'BersihPro Hygiene' },
      { name: 'Sanitiser (5L)', category: 'Cleaning', unit: 'can', location: 'Main store', qty: 5, min: 2, target: 8, cost: 6400, use: 0.14, supplier: 'BersihPro Hygiene' },
      { name: 'Mop heads', category: 'Cleaning', unit: 'pcs', location: 'Main store', qty: 8, min: 4, target: 12, cost: 1500, use: 0.1, supplier: 'BersihPro Hygiene' },
      { name: 'Coffee', category: 'Pantry', unit: 'kg', location: 'Head office', qty: 2.5, min: 1, target: 5, cost: 6800, use: 0.11, supplier: 'KopiKita Supply' },
      { name: 'Sugar sticks', category: 'Pantry', unit: 'box', location: 'Head office', qty: 3, min: 1, target: 4, cost: 1200, use: 0.05, supplier: 'KopiKita Supply' },
      { name: 'A4 paper', category: 'Stationery', unit: 'ream', location: 'Head office', qty: 12, min: 5, target: 25, cost: 1350, use: 0.4, supplier: 'Papertrail Stationery' },
      { name: 'Nitrile gloves', category: 'Safety', unit: 'box', location: 'Main store', qty: 16, min: 15, target: 60, cost: 2400, use: 1.1, supplier: 'SafeHands PPE' },
      { name: 'Hairnets', category: 'Safety', unit: 'pack', location: 'Main store', qty: 24, min: 10, target: 40, cost: 900, use: 0.5, supplier: 'SafeHands PPE' },
      { name: 'Safety vests', category: 'Safety', unit: 'pcs', location: 'Main store', qty: 11, min: 5, target: 15, cost: 1800, use: 0.05, supplier: 'SafeHands PPE' },
      { name: 'Oven door gaskets', category: 'Spare parts', unit: 'pcs', location: 'Main store', qty: 2, min: 2, target: 6, cost: 18500, use: 0.04, supplier: 'Teknik Spares' },
      { name: 'Conveyor belts', category: 'Spare parts', unit: 'pcs', location: 'Warehouse B', qty: 1, min: 1, target: 3, cost: 64000, use: 0.015, supplier: 'Teknik Spares' },
      { name: 'Printer toner', category: 'IT consumables', unit: 'pcs', location: 'Head office', qty: 2, min: 1, target: 3, cost: 28000, use: 0.03, supplier: 'Papertrail Stationery' },
    ],
    ['ravi', 'chloe'].map((key) => ids.get(key)!),
    supplierIds,
    'received',
  );

  // Purchase orders: six months of history, then what's on the way right now.
  const catalogue = [...stock.values()].filter((item) => item.supplierId);
  const orderIds: string[] = [];
  let number = 0;

  const addOrder = async (input: {
    supplier: string;
    status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
    orderedDaysAgo: number | null;
    expectedOffset: number | null;
    receivedOffset?: number | null;
    lines: { name: string; qty: number; received?: number }[];
    requestId?: string | null;
    createdBy?: string;
    notes?: string;
  }) => {
    number += 1;
    const orderedOn = input.orderedDaysAgo === null ? null : addDays(seed.today, -input.orderedDaysAgo);
    const expectedOn = input.expectedOffset === null ? null : addDays(seed.today, input.expectedOffset);
    const receivedOn = input.receivedOffset === undefined || input.receivedOffset === null ? null : addDays(seed.today, input.receivedOffset);
    const [order] = await seed.db
      .insert(purchaseOrders)
      .values({
        workspaceId: workspace.id,
        number,
        supplierId: supplierIds.get(input.supplier)!,
        status: input.status,
        orderedOn,
        expectedOn,
        receivedOn,
        notes: input.notes,
        requestId: input.requestId,
        createdById: ids.get(input.createdBy ?? 'daniel'),
        createdAt: orderedOn ? at(seed, orderedOn, 10) : seed.now,
      })
      .returning({ id: purchaseOrders.id });

    await seed.db.insert(purchaseOrderLines).values(
      input.lines.map((line) => {
        const item = stock.get(line.name)!;
        return {
          orderId: order!.id,
          itemId: item.id,
          description: item.name,
          qty: line.qty,
          unit: item.unit,
          unitCostCents: item.unitCostCents,
          receivedQty: line.received ?? (input.status === 'received' ? line.qty : 0),
        };
      }),
    );

    const spendDate = receivedOn ?? (input.status === 'partial' ? addDays(seed.today, -1) : null);
    if (spendDate) {
      const perCategory = new Map<string, number>();
      for (const line of input.lines) {
        const item = stock.get(line.name)!;
        const receivedQty = line.received ?? line.qty;
        const category = spendCategoryForItem('supply', item.category);
        perCategory.set(category, (perCategory.get(category) ?? 0) + Math.round(receivedQty * item.unitCostCents));
      }
      for (const [category, amountCents] of perCategory) {
        await seed.db.insert(expenses).values({
          workspaceId: workspace.id,
          title: `PO-${String(number).padStart(4, '0')} goods received`,
          category,
          amountCents,
          spentOn: spendDate,
          source: 'order',
          sourceId: order!.id,
          memberId: ids.get('ravi'),
        });
      }
    }
    orderIds.push(order!.id);
    return order!.id;
  };

  const bySupplier = new Map<string, ItemRow[]>();
  for (const item of catalogue) {
    const supplier = supplierRows.find((row) => row.id === item.supplierId)!;
    bySupplier.set(supplier.name, [...(bySupplier.get(supplier.name) ?? []), item as ItemRow]);
  }

  for (let daysAgo = 175; daysAgo > 8; daysAgo -= seed.rng.int(6, 11)) {
    const supplier = seed.rng.pick(supplierRows);
    const options = bySupplier.get(supplier.name) ?? [];
    if (options.length === 0) continue;
    const lineCount = Math.min(options.length, seed.rng.int(1, 3));
    const lines = [...options]
      .sort(() => seed.rng.next() - 0.5)
      .slice(0, lineCount)
      .map((item) => ({ name: item.name, qty: Math.max(1, Math.round((item.targetQty ?? item.quantity * 2) * (0.4 + seed.rng.next() * 0.4))) }));
    const onTime = seed.rng.next() < (reliability.get(supplier.name) ?? 0.8);
    const expected = -daysAgo + supplier.leadTimeDays;
    const received = onTime ? expected - seed.rng.int(0, 1) : expected + seed.rng.int(1, 5);
    await addOrder({ supplier: supplier.name, status: 'received', orderedDaysAgo: daysAgo, expectedOffset: expected, receivedOffset: Math.min(received, -1), lines });
  }

  await addOrder({ supplier: 'SafeHands PPE', status: 'partial', orderedDaysAgo: 6, expectedOffset: -1, lines: [{ name: 'Hairnets', qty: 20, received: 20 }, { name: 'Nitrile gloves', qty: 40, received: 10 }], notes: 'Balance of gloves promised for this week.' });
  await addOrder({ supplier: 'Mesra Packaging', status: 'sent', orderedDaysAgo: 9, expectedOffset: -2, lines: [{ name: 'Kraft boxes (small)', qty: 40 }, { name: 'Food-grade liners', qty: 18 }], notes: 'Festive run stock.' });
  await addOrder({ supplier: 'BersihPro Hygiene', status: 'sent', orderedDaysAgo: 1, expectedOffset: 2, lines: [{ name: 'Sanitiser (5L)', qty: 4 }, { name: 'Mop heads', qty: 6 }] });
  await addOrder({ supplier: 'KopiKita Supply', status: 'sent', orderedDaysAgo: 0, expectedOffset: 2, lines: [{ name: 'Coffee', qty: 3 }, { name: 'Sugar sticks', qty: 2 }] });

  await seed.db.insert(requests).values([
      {
        workspaceId: workspace.id,
        kind: 'purchase',
        title: 'Oven door gaskets before the festive run',
        details: 'Two ovens are due for gasket changes. We hold only two spares.',
        category: 'Spare parts',
        status: 'approved',
        priority: 'high',
        neededBy: addDays(seed.today, 14),
        requestedById: ids.get('ravi'),
        decidedById: ids.get('aina'),
        decidedAt: new Date(seed.now.getTime() - 1 * DAY),
        lines: [{ name: 'Oven door gaskets', qty: 4, unit: 'pcs', unitCostCents: 18500, itemId: stock.get('Oven door gaskets')!.id }],
        estimatedCents: 74000,
        createdAt: new Date(seed.now.getTime() - 2 * DAY),
      },
  ]);

  await addOrder({
    supplier: 'Teknik Spares',
    status: 'draft',
    orderedDaysAgo: null,
    expectedOffset: null,
    lines: [{ name: 'Conveyor belts', qty: 1 }],
    notes: 'Waiting on a final quote.',
  });
  await addOrder({ supplier: 'Papertrail Stationery', status: 'draft', orderedDaysAgo: null, expectedOffset: null, lines: [{ name: 'A4 paper', qty: 15 }, { name: 'Printer toner', qty: 1 }], createdBy: 'alex' });

  await seed.db.insert(requests).values([
    {
      workspaceId: workspace.id,
      kind: 'purchase',
      title: 'Kraft boxes for the festive run',
      details: 'Festive volumes start in two weeks. Current cover is under ten days.',
      category: 'Packaging',
      priority: 'high',
      neededBy: addDays(seed.today, 7),
      requestedById: ids.get('chloe'),
      lines: [
        { name: 'Kraft boxes (small)', qty: 60, unit: 'bundle', unitCostCents: 3800, itemId: stock.get('Kraft boxes (small)')!.id },
        { name: 'Kraft boxes (medium)', qty: 30, unit: 'bundle', unitCostCents: 4500, itemId: stock.get('Kraft boxes (medium)')!.id },
      ],
      estimatedCents: 363000,
      createdAt: new Date(seed.now.getTime() - 3 * 3_600_000),
    },
    {
      workspaceId: workspace.id,
      kind: 'purchase',
      title: 'Nitrile gloves for Q1',
      details: 'Usage has gone up since the second shift started.',
      category: 'Safety',
      neededBy: addDays(seed.today, 21),
      requestedById: ids.get('ravi'),
      lines: [{ name: 'Nitrile gloves', qty: 100, unit: 'box', unitCostCents: 2400, itemId: stock.get('Nitrile gloves')!.id }],
      estimatedCents: 240000,
      createdAt: new Date(seed.now.getTime() - 26 * 3_600_000),
    },
    {
      workspaceId: workspace.id,
      kind: 'purchase',
      title: 'Floor degreaser top-up',
      category: 'Cleaning',
      requestedById: ids.get('ravi'),
      lines: [{ name: 'Floor degreaser', qty: 6, unit: 'can', unitCostCents: 5600, itemId: stock.get('Floor degreaser')!.id }],
      estimatedCents: 33600,
      createdAt: new Date(seed.now.getTime() - 50 * 3_600_000),
    },
    {
      workspaceId: workspace.id,
      kind: 'purchase',
      title: 'Label printer for dispatch',
      details: 'The current one jams twice a shift.',
      category: 'IT consumables',
      requestedById: ids.get('chloe'),
      lines: [{ name: 'Label printer', qty: 1, unit: 'pcs', unitCostCents: 145000 }],
      estimatedCents: 145000,
      createdAt: new Date(seed.now.getTime() - 76 * 3_600_000),
    },
    {
      workspaceId: workspace.id,
      kind: 'purchase',
      title: 'New chairs for head office',
      status: 'rejected',
      decisionNote: 'Outside this quarter’s budget.',
      category: 'Other',
      requestedById: ids.get('chloe'),
      decidedById: ids.get('aina'),
      decidedAt: new Date(seed.now.getTime() - 12 * DAY),
      estimatedCents: 420000,
      createdAt: new Date(seed.now.getTime() - 14 * DAY),
    },
  ]);

  await seed.db.update(workspaces).set({ orderSeq: number }).where(eq(workspaces.id, workspace.id));

  await addExpenseHistory(
    seed,
    workspace.id,
    [['Logistics', 180000, 3, ['Courier charges', 'Lorry hire', 'Pallet rental']]],
    ['daniel', 'alex'],
    ids,
  );
  await seed.db.insert(budgets).values(
    [
      ['Packaging', 850000],
      ['Cleaning', 150000],
      ['Pantry', 60000],
      ['Stationery', 50000],
      ['Safety', 200000],
      ['Spare parts', 300000],
      ['IT consumables', 60000],
      ['Logistics', 200000],
    ].map(([category, amountCents]) => ({ workspaceId: workspace.id, category: category as string, amountCents: amountCents as number })),
  );

  await addTasks(
    seed,
    workspace.id,
    ids,
    [
      { title: 'Chase Mesra Packaging about the late delivery', area: 'Supplier follow-up', who: 'daniel', due: 0, priority: 'high', minutes: 15 },
      { title: 'Compare three quotes for nitrile gloves', area: 'Sourcing', who: 'alex', due: 0, minutes: 45, doing: true },
      { title: 'Count the packaging aisle', area: 'Stock take', who: 'ravi', due: 0, repeat: 'weekly', minutes: 60, done: 'ravi' },
      { title: 'Check the delivery bay for damaged goods', area: 'Receiving', who: 'ravi', due: 0, repeat: 'weekdays', minutes: 15 },
      { title: 'Send the festive demand plan to operations', area: 'Admin', who: 'chloe', due: 0, minutes: 30 },
      { title: 'Review the expiring Teknik Spares contract', area: 'Sourcing', who: 'daniel', due: -2, priority: 'high', minutes: 60 },
      { title: 'Follow up on late deliveries', area: 'Supplier follow-up', who: 'alex', due: 1, repeat: 'weekly', minutes: 30 },
      { title: 'Update approved supplier list', area: 'Audit', who: 'aina', due: 3, minutes: 30 },
      { title: 'Prepare the quarterly spend report', area: 'Admin', who: 'aina', due: 6, minutes: 90 },
      { title: 'Run the month-end stock take', area: 'Stock take', who: 'ravi', due: 12, repeat: 'monthly', priority: 'high', minutes: 120 },
      { title: 'Review supplier prices', area: 'Sourcing', who: 'daniel', due: 20, repeat: 'quarterly', minutes: 90 },
    ],
    'daniel',
  );
  await addTaskHistory(
    seed,
    workspace.id,
    ids,
    ['ravi', 'ravi', 'alex', 'chloe', 'daniel'],
    [
      ['Count the packaging aisle', 'Stock take', 60],
      ['Check the delivery bay for damaged goods', 'Receiving', 15],
      ['Follow up on late deliveries', 'Supplier follow-up', 30],
      ['Match delivery notes to orders', 'Receiving', 20],
    ],
    [7, 13],
  );

  await seed.db.insert(events).values([
    { workspaceId: workspace.id, title: 'Supplier review with Mesra', date: addDays(seed.today, 3), time: '14:00', kind: 'meeting' },
    { workspaceId: workspace.id, title: 'Festive demand planning', date: addDays(seed.today, 8), time: '10:00', kind: 'meeting' },
    { workspaceId: workspace.id, title: 'Internal stock audit', date: addDays(seed.today, 19), kind: 'other' },
  ]);

  await addChecklist(
    seed,
    workspace.id,
    { name: 'Month-end stock take', description: 'Close the month with numbers you can trust.', cadence: 'monthly', steps: STOCK_TAKE, position: 0 },
    monthKey(seed.today),
    ['count'],
    'Ravi Menon',
  );

  await addActivity(seed, workspace.id, ids, names, [
    ['chloe', 'asked for “Kraft boxes for the festive run”', 'request', 180],
    ['ravi', 'finished “Count the packaging aisle”', 'task', 240],
    ['daniel', 'sent PO to KopiKita Supply', 'order', 300],
    ['ravi', 'asked for “Nitrile gloves for Q1”', 'request', 1560],
    ['aina', 'approved “Oven door gaskets before the festive run”', 'request', 1440],
  ]);
}

async function upsertUsers(db: DB): Promise<Map<string, string>> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const list = [...DEMO_ACCOUNTS.map(({ email, name }) => ({ email, name })), ...EXTRA_USERS];
  const ids = new Map<string, string>();
  for (const { email, name } of list) {
    const [user] = await db
      .insert(users)
      .values({ email, name, passwordHash, isDemo: true, emailVerifiedAt: new Date() })
      .onConflictDoUpdate({ target: users.email, set: { name, passwordHash, isDemo: true } })
      .returning({ id: users.id });
    ids.set(email, user!.id);
  }
  return ids;
}

export async function seedDemo(db: DB, now: Date) {
  const seed: Seed = { db, now, today: todayIn(TIMEZONE, now), rng: createRng(20261104), userIds: await upsertUsers(db) };
  await seedHome(seed);
  await seedPeople(seed);
  await seedSupply(seed);
}

/** Starts the dummy world again from scratch. Workspaces made with real accounts are left alone. */
export async function reseedDemo(db: DB, now: Date) {
  await db.delete(workspaces).where(eq(workspaces.isDemo, true));
  await db.update(users).set({ lastWorkspaceId: null }).where(eq(users.isDemo, true));
  await seedDemo(db, now);
}

/** Keeps the demo lively: dates are relative to the seed day, so a stale copy would be all overdue. */
export async function ensureDemo(db: DB, now: Date) {
  const [row] = await db
    .select({ oldest: sql<Date | null>`min(${workspaces.createdAt})`, count: sql<string>`count(*)` })
    .from(workspaces)
    .where(and(eq(workspaces.isDemo, true)));
  if (Number(row?.count ?? 0) === 0) return seedDemo(db, now);
  const oldest = row?.oldest ? new Date(row.oldest) : now;
  if (now.getTime() - oldest.getTime() > 3 * DAY) await reseedDemo(db, now);
}
