import { z } from 'zod';
import { EDITIONS, ROLES } from './editions';
import { RECURRENCES } from './recurrence';

const name = z.string().trim().min(1, 'Enter a name').max(120);
const shortText = z.string().trim().max(120);
const longText = z.string().trim().max(4000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
const uuid = z.uuid();
const cents = z.number().int().min(0).max(100_000_000_000);
const quantity = z.number().min(0).max(100_000_000);

export const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')).pipe(z.string().max(254));
export const password = z.string().min(8, 'Use at least 8 characters').max(200);

export const signupInput = z.object({ name, email, password });
export const loginInput = z.object({ email, password: z.string().min(1, 'Enter your password').max(200) });
export const forgotInput = z.object({ email });
export const resetInput = z.object({ token: z.string().min(16).max(200), password });
export const profileInput = z.object({ name });
export const passwordChangeInput = z.object({ current: z.string().max(200).optional(), next: password });

export const PRIORITIES = ['low', 'normal', 'high'] as const;
export const TASK_STATUSES = ['todo', 'doing', 'done', 'skipped'] as const;
export const EVENT_KINDS = ['appointment', 'school', 'meeting', 'delivery', 'holiday', 'other'] as const;
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const REQUEST_KINDS = ['supply', 'repair', 'purchase', 'other'] as const;
export const REQUEST_STATUSES = ['open', 'approved', 'rejected', 'ordered', 'done'] as const;
export const ORDER_STATUSES = ['draft', 'sent', 'partial', 'received', 'cancelled'] as const;
export const CADENCES = ['weekly', 'monthly', 'once'] as const;
export const MOVEMENT_REASONS = ['used', 'restocked', 'received', 'adjusted'] as const;
export const RESTOCK_SOURCES = ['auto', 'manual', 'meal', 'request'] as const;
export const EXPENSE_SOURCES = ['manual', 'bill', 'restock', 'order'] as const;

export const workspaceInput = z.object({
  name,
  edition: z.enum(EDITIONS),
  currency: z.string().trim().length(3).toUpperCase().default('MYR'),
  timezone: z.string().trim().max(64).default('Asia/Kuala_Lumpur'),
  starter: z.boolean().default(true),
});
export const workspaceUpdate = z
  .object({ name, currency: z.string().trim().length(3).toUpperCase(), timezone: z.string().trim().max(64) })
  .partial();

export const memberInput = z.object({
  name,
  role: z.enum(ROLES).default('member'),
  title: shortText.nullish(),
  department: shortText.nullish(),
  phone: shortText.nullish(),
});
export const memberUpdate = memberInput.partial();
export const inviteInput = z.object({ memberId: uuid.nullish(), role: z.enum(ROLES).default('member'), email: email.nullish() });

export const taskInput = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200),
  notes: longText.nullish(),
  area: shortText.nullish(),
  assigneeId: uuid.nullish(),
  dueOn: isoDate.nullish(),
  priority: z.enum(PRIORITIES).default('normal'),
  recurrence: z.enum(RECURRENCES).default('none'),
  estimatedMinutes: z.number().int().min(0).max(10_000).nullish(),
});
export const taskUpdate = taskInput.partial().extend({ status: z.enum(['todo', 'doing']).optional() });

export const itemInput = z.object({
  name,
  category: shortText.default('Other'),
  unit: z.string().trim().min(1).max(30).default('pcs'),
  location: shortText.nullish(),
  quantity: quantity.default(0),
  minQty: quantity.default(0),
  targetQty: quantity.nullish(),
  unitCostCents: cents.default(0),
  supplierId: uuid.nullish(),
  expiresOn: isoDate.nullish(),
  notes: longText.nullish(),
});
export const itemUpdate = itemInput.partial();
export const adjustInput = z.object({
  delta: z.number().min(-100_000_000).max(100_000_000).refine((v) => v !== 0, 'Enter an amount'),
  reason: z.enum(MOVEMENT_REASONS).default('used'),
  note: shortText.nullish(),
});

export const restockInput = z.object({
  name,
  itemId: uuid.nullish(),
  quantity: z.number().positive('Enter an amount').max(100_000_000).default(1),
  unit: z.string().trim().max(30).nullish(),
  estCostCents: cents.default(0),
});
export const restockUpdate = restockInput.partial();
export const boughtInput = z.object({ actualCostCents: cents.nullish(), quantity: z.number().positive().max(100_000_000).nullish() });

export const expenseInput = z.object({
  title: z.string().trim().min(1, 'Enter a description').max(200),
  category: shortText.default('Other'),
  amountCents: cents,
  spentOn: isoDate,
  paymentMethod: shortText.nullish(),
  notes: longText.nullish(),
});
export const expenseUpdate = expenseInput.partial();
export const budgetsInput = z.object({ budgets: z.array(z.object({ category: shortText.min(1), amountCents: cents })).max(50) });

export const billInput = z.object({
  name,
  provider: shortText.nullish(),
  category: shortText.default('Utilities'),
  amountCents: cents,
  dueOn: isoDate,
  recurrence: z.enum(RECURRENCES).default('monthly'),
  paymentMethod: shortText.nullish(),
});
export const billUpdate = billInput.partial();

export const ingredient = z.object({ name, qty: z.number().min(0).max(100_000).nullish(), unit: z.string().trim().max(30).nullish(), itemId: uuid.nullish() });
export const recipeInput = z.object({
  name,
  notes: longText.nullish(),
  prepMinutes: z.number().int().min(0).max(10_000).nullish(),
  cookMinutes: z.number().int().min(0).max(10_000).nullish(),
  serves: z.number().int().min(0).max(1000).nullish(),
  favorite: z.boolean().default(false),
  ingredients: z.array(ingredient).max(100).default([]),
});
export const recipeUpdate = recipeInput.partial();
export const mealInput = z.object({
  date: isoDate,
  slot: z.enum(MEAL_SLOTS),
  title: z.string().trim().min(1, 'Enter a meal').max(200),
  recipeId: uuid.nullish(),
  notes: longText.nullish(),
});
export const mealUpdate = mealInput.partial();

export const eventInput = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200),
  date: isoDate,
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Use the format HH:MM').nullish(),
  kind: z.enum(EVENT_KINDS).default('other'),
  notes: longText.nullish(),
});
export const eventUpdate = eventInput.partial();

export const requestLine = z.object({
  itemId: uuid.nullish(),
  name,
  qty: z.number().positive('Enter an amount').max(100_000_000).default(1),
  unit: z.string().trim().max(30).nullish(),
  unitCostCents: cents.default(0),
});
export const requestInput = z.object({
  kind: z.enum(REQUEST_KINDS).default('other'),
  title: z.string().trim().min(1, 'Enter a title').max(200),
  details: longText.nullish(),
  category: shortText.nullish(),
  neededBy: isoDate.nullish(),
  priority: z.enum(PRIORITIES).default('normal'),
  lines: z.array(requestLine).max(100).default([]),
});
export const decisionInput = z.object({ note: shortText.nullish(), assigneeId: uuid.nullish() });

export const supplierInput = z.object({
  name,
  contactName: shortText.nullish(),
  email: email.nullish().or(z.literal('').transform(() => null)),
  phone: shortText.nullish(),
  category: shortText.nullish(),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  leadTimeDays: z.number().int().min(0).max(365).default(3),
  notes: longText.nullish(),
});
export const supplierUpdate = supplierInput.partial();

export const orderLine = z.object({
  itemId: uuid.nullish(),
  description: z.string().trim().min(1, 'Describe the line').max(200),
  qty: z.number().positive('Enter an amount').max(100_000_000),
  unit: z.string().trim().max(30).nullish(),
  unitCostCents: cents,
});
export const orderInput = z.object({
  supplierId: uuid,
  expectedOn: isoDate.nullish(),
  notes: longText.nullish(),
  requestId: uuid.nullish(),
  lines: z.array(orderLine).min(1, 'Add at least one line').max(200),
});
export const orderUpdate = z.object({ expectedOn: isoDate.nullish(), notes: longText.nullish(), lines: z.array(orderLine).min(1).max(200).optional() });
export const receiveInput = z.object({
  lines: z.array(z.object({ lineId: uuid, qty: z.number().positive().max(100_000_000) })).min(1, 'Enter what arrived'),
});

export const checklistStep = z.object({ id: z.string().min(1).max(40).optional(), title: z.string().trim().min(1).max(200), hint: z.string().trim().max(300).nullish() });
export const checklistInput = z.object({
  name,
  description: z.string().trim().max(400).nullish(),
  cadence: z.enum(CADENCES).default('weekly'),
  steps: z.array(checklistStep).min(1, 'Add at least one step').max(50),
});
export const checklistUpdate = checklistInput.partial();

export const boardActorInput = z.object({ memberId: uuid.nullish() });

export type SignupInput = z.infer<typeof signupInput>;
export type LoginInput = z.infer<typeof loginInput>;
export type WorkspaceInput = z.input<typeof workspaceInput>;
export type MemberInput = z.input<typeof memberInput>;
export type TaskInput = z.input<typeof taskInput>;
export type ItemInput = z.input<typeof itemInput>;
export type RestockInput = z.input<typeof restockInput>;
export type ExpenseInput = z.input<typeof expenseInput>;
export type BillInput = z.input<typeof billInput>;
export type RecipeInput = z.input<typeof recipeInput>;
export type MealInput = z.input<typeof mealInput>;
export type EventInput = z.input<typeof eventInput>;
export type RequestInput = z.input<typeof requestInput>;
export type SupplierInput = z.input<typeof supplierInput>;
export type OrderInput = z.input<typeof orderInput>;
export type ChecklistInput = z.input<typeof checklistInput>;
