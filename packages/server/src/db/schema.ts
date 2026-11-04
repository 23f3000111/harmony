import { sql } from 'drizzle-orm';
import { boolean, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type {
  Cadence,
  ChecklistStep,
  Edition,
  EventKind,
  Ingredient,
  MealSlot,
  OrderStatus,
  Priority,
  Recurrence,
  RequestKind,
  RequestLine,
  RequestStatus,
  Role,
  TaskStatus,
} from '@harmony/shared';

const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const workspaceRef = () => uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  googleSub: text('google_sub').unique(),
  avatarUrl: text('avatar_url'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  isDemo: boolean('is_demo').notNull().default(false),
  lastWorkspaceId: uuid('last_workspace_id'),
  createdAt: created(),
  updatedAt: updated(),
});

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the cookie token, so a database leak can't be replayed as a login. */
    id: text('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    createdAt: created(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const passwordResets = pgTable('password_resets', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: created(),
});

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  edition: text('edition').$type<Edition>().notNull(),
  currency: text('currency').notNull().default('MYR'),
  timezone: text('timezone').notNull().default('Asia/Kuala_Lumpur'),
  boardToken: text('board_token').unique(),
  isDemo: boolean('is_demo').notNull().default(false),
  orderSeq: integer('order_seq').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: created(),
  updatedAt: updated(),
});

/** A person in a workspace. Kids or helpers can be people here without ever having a login. */
export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    role: text('role').$type<Role>().notNull().default('member'),
    title: text('title'),
    department: text('department'),
    phone: text('phone'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [uniqueIndex('members_workspace_user_uq').on(t.workspaceId, t.userId), index('members_user_idx').on(t.userId)],
);

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    memberId: uuid('member_id').references(() => members.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    role: text('role').$type<Role>().notNull().default('member'),
    email: text('email'),
    createdById: uuid('created_by_id').references(() => members.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [index('invites_workspace_idx').on(t.workspaceId)],
);

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    name: text('name').notNull(),
    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    category: text('category'),
    paymentTermsDays: integer('payment_terms_days').notNull().default(30),
    leadTimeDays: integer('lead_time_days').notNull().default(3),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [index('suppliers_workspace_idx').on(t.workspaceId)],
);

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    name: text('name').notNull(),
    category: text('category').notNull().default('Other'),
    unit: text('unit').notNull().default('pcs'),
    location: text('location'),
    quantity: doublePrecision('quantity').notNull().default(0),
    minQty: doublePrecision('min_qty').notNull().default(0),
    targetQty: doublePrecision('target_qty'),
    unitCostCents: integer('unit_cost_cents').notNull().default(0),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    expiresOn: date('expires_on', { mode: 'string' }),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('items_workspace_idx').on(t.workspaceId, t.archivedAt)],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
    delta: doublePrecision('delta').notNull(),
    reason: text('reason').notNull(),
    memberId: uuid('member_id').references(() => members.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: created(),
  },
  (t) => [index('movements_lookup_idx').on(t.workspaceId, t.createdAt), index('movements_item_idx').on(t.itemId, t.createdAt)],
);

export const restockEntries = pgTable(
  'restock_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    quantity: doublePrecision('quantity').notNull().default(1),
    unit: text('unit'),
    estCostCents: integer('est_cost_cents').notNull().default(0),
    status: text('status').$type<'needed' | 'bought' | 'removed'>().notNull().default('needed'),
    source: text('source').$type<'auto' | 'manual' | 'meal' | 'request'>().notNull().default('manual'),
    addedById: uuid('added_by_id').references(() => members.id, { onDelete: 'set null' }),
    boughtById: uuid('bought_by_id').references(() => members.id, { onDelete: 'set null' }),
    boughtAt: timestamp('bought_at', { withTimezone: true }),
    actualCostCents: integer('actual_cost_cents'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index('restock_workspace_idx').on(t.workspaceId, t.status),
    uniqueIndex('restock_open_item_uq').on(t.itemId).where(sql`${t.status} = 'needed' and ${t.itemId} is not null`),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    title: text('title').notNull(),
    notes: text('notes'),
    area: text('area'),
    assigneeId: uuid('assignee_id').references(() => members.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id').references(() => members.id, { onDelete: 'set null' }),
    dueOn: date('due_on', { mode: 'string' }),
    priority: text('priority').$type<Priority>().notNull().default('normal'),
    status: text('status').$type<TaskStatus>().notNull().default('todo'),
    recurrence: text('recurrence').$type<Recurrence>().notNull().default('none'),
    anchorDay: smallint('anchor_day'),
    seriesId: uuid('series_id'),
    /** The next repeat created when this one was finished, so "undo" can remove it again. */
    spawnedNextId: uuid('spawned_next_id'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedById: uuid('completed_by_id').references(() => members.id, { onDelete: 'set null' }),
    estimatedMinutes: integer('estimated_minutes'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index('tasks_board_idx').on(t.workspaceId, t.status, t.dueOn),
    index('tasks_assignee_idx').on(t.workspaceId, t.assigneeId),
    index('tasks_completed_idx').on(t.workspaceId, t.completedAt),
  ],
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    title: text('title').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    time: text('time'),
    kind: text('kind').$type<EventKind>().notNull().default('other'),
    notes: text('notes'),
    createdAt: created(),
  },
  (t) => [index('events_date_idx').on(t.workspaceId, t.date)],
);

export const bills = pgTable(
  'bills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    name: text('name').notNull(),
    provider: text('provider'),
    category: text('category').notNull().default('Utilities'),
    amountCents: integer('amount_cents').notNull().default(0),
    dueOn: date('due_on', { mode: 'string' }).notNull(),
    recurrence: text('recurrence').$type<Recurrence>().notNull().default('monthly'),
    anchorDay: smallint('anchor_day'),
    paymentMethod: text('payment_method'),
    status: text('status').$type<'due' | 'paid'>().notNull().default('due'),
    paidOn: date('paid_on', { mode: 'string' }),
    expenseId: uuid('expense_id'),
    spawnedNextId: uuid('spawned_next_id'),
    createdAt: created(),
  },
  (t) => [index('bills_due_idx').on(t.workspaceId, t.status, t.dueOn)],
);

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    title: text('title').notNull(),
    category: text('category').notNull().default('Other'),
    amountCents: integer('amount_cents').notNull(),
    spentOn: date('spent_on', { mode: 'string' }).notNull(),
    paymentMethod: text('payment_method'),
    source: text('source').$type<'manual' | 'bill' | 'restock' | 'order'>().notNull().default('manual'),
    sourceId: uuid('source_id'),
    memberId: uuid('member_id').references(() => members.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: created(),
  },
  (t) => [index('expenses_month_idx').on(t.workspaceId, t.spentOn), index('expenses_source_idx').on(t.sourceId)],
);

export const budgets = pgTable(
  'budgets',
  {
    workspaceId: workspaceRef(),
    category: text('category').notNull(),
    amountCents: integer('amount_cents').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.category] })],
);

export const recipes = pgTable(
  'recipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    name: text('name').notNull(),
    notes: text('notes'),
    prepMinutes: integer('prep_minutes'),
    cookMinutes: integer('cook_minutes'),
    serves: integer('serves'),
    favorite: boolean('favorite').notNull().default(false),
    ingredients: jsonb('ingredients').$type<Ingredient[]>().notNull().default([]),
    createdAt: created(),
  },
  (t) => [index('recipes_workspace_idx').on(t.workspaceId)],
);

export const meals = pgTable(
  'meals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    date: date('date', { mode: 'string' }).notNull(),
    slot: text('slot').$type<MealSlot>().notNull(),
    title: text('title').notNull(),
    recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('meals_slot_uq').on(t.workspaceId, t.date, t.slot)],
);

export const requests = pgTable(
  'requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    kind: text('kind').$type<RequestKind>().notNull().default('other'),
    title: text('title').notNull(),
    details: text('details'),
    category: text('category'),
    neededBy: date('needed_by', { mode: 'string' }),
    priority: text('priority').$type<Priority>().notNull().default('normal'),
    status: text('status').$type<RequestStatus>().notNull().default('open'),
    requestedById: uuid('requested_by_id').references(() => members.id, { onDelete: 'set null' }),
    decidedById: uuid('decided_by_id').references(() => members.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    lines: jsonb('lines').$type<RequestLine[]>().notNull().default([]),
    estimatedCents: integer('estimated_cents').notNull().default(0),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    orderId: uuid('order_id'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('requests_status_idx').on(t.workspaceId, t.status)],
);

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    number: integer('number').notNull(),
    supplierId: uuid('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'restrict' }),
    status: text('status').$type<OrderStatus>().notNull().default('draft'),
    orderedOn: date('ordered_on', { mode: 'string' }),
    expectedOn: date('expected_on', { mode: 'string' }),
    receivedOn: date('received_on', { mode: 'string' }),
    notes: text('notes'),
    requestId: uuid('request_id').references(() => requests.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id').references(() => members.id, { onDelete: 'set null' }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('orders_number_uq').on(t.workspaceId, t.number), index('orders_status_idx').on(t.workspaceId, t.status)],
);

export const purchaseOrderLines = pgTable(
  'purchase_order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
    description: text('description').notNull(),
    qty: doublePrecision('qty').notNull(),
    unit: text('unit'),
    unitCostCents: integer('unit_cost_cents').notNull().default(0),
    receivedQty: doublePrecision('received_qty').notNull().default(0),
  },
  (t) => [index('order_lines_order_idx').on(t.orderId)],
);

export const checklists = pgTable(
  'checklists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    name: text('name').notNull(),
    description: text('description'),
    cadence: text('cadence').$type<Cadence>().notNull().default('weekly'),
    steps: jsonb('steps').$type<ChecklistStep[]>().notNull().default([]),
    position: integer('position').notNull().default(0),
    createdAt: created(),
  },
  (t) => [index('checklists_workspace_idx').on(t.workspaceId)],
);

export const checklistRuns = pgTable(
  'checklist_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    checklistId: uuid('checklist_id').notNull().references(() => checklists.id, { onDelete: 'cascade' }),
    periodKey: text('period_key').notNull(),
    done: jsonb('done').$type<Record<string, { memberName: string | null; at: string }>>().notNull().default({}),
    createdAt: created(),
  },
  (t) => [uniqueIndex('checklist_runs_period_uq').on(t.checklistId, t.periodKey)],
);

export const activity = pgTable(
  'activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceRef(),
    actorId: uuid('actor_id').references(() => members.id, { onDelete: 'set null' }),
    actorName: text('actor_name'),
    summary: text('summary').notNull(),
    objectType: text('object_type').notNull(),
    objectId: uuid('object_id'),
    createdAt: created(),
  },
  (t) => [index('activity_feed_idx').on(t.workspaceId, t.createdAt)],
);

export type UserRow = typeof users.$inferSelect;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type MemberRow = typeof members.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type ItemRow = typeof items.$inferSelect;
export type RestockRow = typeof restockEntries.$inferSelect;
export type BillRow = typeof bills.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
export type RequestRow = typeof requests.$inferSelect;
export type OrderRow = typeof purchaseOrders.$inferSelect;
export type SupplierRow = typeof suppliers.$inferSelect;
export type ChecklistRow = typeof checklists.$inferSelect;
export type MealRow = typeof meals.$inferSelect;
export type RecipeRow = typeof recipes.$inferSelect;
export type EventRow = typeof events.$inferSelect;
