import type { ISODate } from './dates';
import type { Edition, Role } from './editions';
import type { Forecast } from './forecast';
import type { Recurrence } from './recurrence';

export type Priority = 'low' | 'normal' | 'high';
export type TaskStatus = 'todo' | 'doing' | 'done' | 'skipped';
export type EventKind = 'appointment' | 'school' | 'meeting' | 'delivery' | 'holiday' | 'other';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type RequestKind = 'supply' | 'repair' | 'purchase' | 'other';
export type RequestStatus = 'open' | 'approved' | 'rejected' | 'ordered' | 'done';
export type OrderStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
export type Cadence = 'weekly' | 'monthly' | 'once';

export interface PublicConfig {
  demoMode: boolean;
  googleEnabled: boolean;
  mailEnabled: boolean;
  demoAccounts: DemoAccount[];
  demoPassword: string | null;
}

export interface DemoAccount {
  email: string;
  name: string;
  role: string;
  edition: Edition | 'all';
  blurb: string;
}

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
  isDemo: boolean;
  lastWorkspaceId: string | null;
}

export interface WorkspaceDTO {
  id: string;
  name: string;
  edition: Edition;
  currency: string;
  timezone: string;
  isDemo: boolean;
  /** Only sent to people who manage the workspace. */
  boardToken?: string | null;
  myRole: Role;
  myMemberId: string;
  today: ISODate;
}

export interface MemberDTO {
  id: string;
  name: string;
  role: Role;
  title: string | null;
  department: string | null;
  phone: string | null;
  hasLogin: boolean;
  avatarUrl: string | null;
  invitePending: boolean;
}

export interface MemberStats extends MemberDTO {
  openTasks: number;
  overdueTasks: number;
  doneThisWeek: number;
}

export interface TaskDTO {
  id: string;
  title: string;
  notes: string | null;
  area: string | null;
  assigneeId: string | null;
  dueOn: ISODate | null;
  priority: Priority;
  status: TaskStatus;
  recurrence: Recurrence;
  seriesId: string | null;
  completedAt: string | null;
  completedById: string | null;
  estimatedMinutes: number | null;
  createdAt: string;
}

export interface ItemDTO {
  id: string;
  name: string;
  category: string;
  unit: string;
  location: string | null;
  quantity: number;
  minQty: number;
  targetQty: number | null;
  unitCostCents: number;
  supplierId: string | null;
  supplierName: string | null;
  expiresOn: ISODate | null;
  notes: string | null;
  forecast: Forecast;
  onList: boolean;
  /** Still to arrive on sent purchase orders. */
  onOrder: number;
}

export interface MovementDTO {
  id: string;
  itemId: string;
  delta: number;
  reason: string;
  note: string | null;
  memberName: string | null;
  createdAt: string;
}

export interface RestockDTO {
  id: string;
  itemId: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  estCostCents: number;
  status: 'needed' | 'bought' | 'removed';
  source: 'auto' | 'manual' | 'meal' | 'request';
  category: string | null;
  addedByName: string | null;
  boughtByName: string | null;
  boughtAt: string | null;
  actualCostCents: number | null;
}

export interface ExpenseDTO {
  id: string;
  title: string;
  category: string;
  amountCents: number;
  spentOn: ISODate;
  paymentMethod: string | null;
  source: 'manual' | 'bill' | 'restock' | 'order';
  notes: string | null;
  memberName: string | null;
}

export interface BudgetLine {
  category: string;
  amountCents: number;
  spentCents: number;
}

export interface BillDTO {
  id: string;
  name: string;
  provider: string | null;
  category: string;
  amountCents: number;
  dueOn: ISODate;
  recurrence: Recurrence;
  paymentMethod: string | null;
  status: 'due' | 'paid';
  paidOn: ISODate | null;
}

export interface SpendingSummary {
  month: string;
  spentCents: number;
  budgetCents: number;
  byCategory: BudgetLine[];
  byMonth: { month: string; spentCents: number }[];
  unbudgetedCents: number;
}

export interface Ingredient {
  name: string;
  qty?: number | null;
  unit?: string | null;
  itemId?: string | null;
}

export interface RecipeDTO {
  id: string;
  name: string;
  notes: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  serves: number | null;
  favorite: boolean;
  ingredients: Ingredient[];
}

export interface MealDTO {
  id: string;
  date: ISODate;
  slot: MealSlot;
  title: string;
  recipeId: string | null;
  notes: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  serves: number | null;
}

export interface EventDTO {
  id: string;
  title: string;
  date: ISODate;
  time: string | null;
  kind: EventKind;
  notes: string | null;
}

export interface RequestLine {
  itemId?: string | null;
  name: string;
  qty: number;
  unit?: string | null;
  unitCostCents: number;
}

export interface RequestDTO {
  id: string;
  kind: RequestKind;
  title: string;
  details: string | null;
  category: string | null;
  neededBy: ISODate | null;
  priority: Priority;
  status: RequestStatus;
  requestedById: string | null;
  requestedByName: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  lines: RequestLine[];
  estimatedCents: number;
  taskId: string | null;
  orderId: string | null;
  createdAt: string;
}

export interface SupplierDTO {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  category: string | null;
  paymentTermsDays: number;
  leadTimeDays: number;
  notes: string | null;
  ordersReceived: number;
  onTimePercent: number | null;
  spentCents: number;
}

export interface OrderLineDTO {
  id: string;
  itemId: string | null;
  description: string;
  qty: number;
  unit: string | null;
  unitCostCents: number;
  receivedQty: number;
}

export interface OrderDTO {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  status: OrderStatus;
  orderedOn: ISODate | null;
  expectedOn: ISODate | null;
  receivedOn: ISODate | null;
  notes: string | null;
  requestId: string | null;
  createdByName: string | null;
  totalCents: number;
  receivedCents: number;
  lines: OrderLineDTO[];
  createdAt: string;
}

export interface ChecklistStep {
  id: string;
  title: string;
  hint?: string | null;
}

export interface ChecklistDTO {
  id: string;
  name: string;
  description: string | null;
  cadence: Cadence;
  steps: ChecklistStep[];
  periodKey: string;
  done: Record<string, { memberName: string | null; at: string }>;
  doneCount: number;
}

export interface ActivityDTO {
  id: string;
  actorName: string | null;
  summary: string;
  objectType: string;
  objectId: string | null;
  createdAt: string;
}

export interface UpcomingDTO {
  id: string;
  kind: 'event' | 'bill' | 'task' | 'delivery';
  title: string;
  date: ISODate;
  time: string | null;
  detail: string | null;
  amountCents: number | null;
  personId: string | null;
  href: string;
}

export interface ShelfItem {
  id: string;
  name: string;
  level: number;
  status: Forecast['status'];
  quantity: number;
  unit: string;
}

export interface TimelineTask {
  id: string;
  title: string;
  dueOn: ISODate;
  status: TaskStatus;
  assigneeId: string | null;
  priority: Priority;
}

export interface DashboardDTO {
  today: ISODate;
  me: MemberStats;
  members: MemberStats[];
  tasks: {
    mine: TaskDTO[];
    today: TaskDTO[];
    overdueCount: number;
    openCount: number;
    dueTodayCount: number;
    doneTodayCount: number;
    doneThisWeek: number;
    myOpenCount: number;
    myOverdueCount: number;
    perWeek: { weekStart: ISODate; done: number }[];
  };
  timeline: { start: ISODate; tasks: TimelineTask[] };
  stock: {
    shelf: ShelfItem[];
    lowCount: number;
    itemCount: number;
    runningOut: { id: string; name: string; daysLeft: number; runsOutOn: ISODate; unit: string; quantity: number; status: Forecast['status'] }[];
    useFirst: { id: string; name: string; expiresOn: ISODate; quantity: number; unit: string; location: string | null }[];
  };
  restock: { openCount: number; estCents: number; top: RestockDTO[] };
  money: null | {
    monthSpentCents: number;
    monthBudgetCents: number;
    byMonth: { month: string; spentCents: number }[];
    byCategory: BudgetLine[];
    billsDueCount: number;
    billsDueCents: number;
    nextBill: BillDTO | null;
  };
  meals: null | { tonight: MealDTO | null; week: MealDTO[] };
  requests: null | { openCount: number; waiting: RequestDTO[]; mine: RequestDTO[] };
  orders: null | {
    openCount: number;
    openCents: number;
    awaitingDelivery: OrderDTO[];
    lateCount: number;
    draftCount: number;
  };
  checklist: ChecklistDTO | null;
  upcoming: UpcomingDTO[];
  activity: ActivityDTO[];
}

export interface MonthAheadDTO {
  month: string;
  today: ISODate;
  start: ISODate;
  end: ISODate;
  restock: {
    id: string;
    name: string;
    unit: string;
    quantity: number;
    minQty: number;
    category: string;
    supplierName: string | null;
    onList: boolean;
    forecast: Forecast;
  }[];
  restockCents: number;
  tasks: {
    total: number;
    minutes: number;
    perPerson: { memberId: string | null; name: string; count: number; minutes: number }[];
    byDate: Record<string, number>;
    list: { title: string; date: ISODate; assigneeId: string | null; recurrence: Recurrence }[];
  };
  bills: { id: string; name: string; amountCents: number; dueOn: ISODate; recurring: boolean }[];
  billsCents: number;
  events: EventDTO[];
  deliveries: { id: string; number: string; supplierName: string; expectedOn: ISODate; totalCents: number }[];
  budget: { budgetCents: number; committedCents: number; lastMonthCents: number };
}

export interface SearchHit {
  id: string;
  kind: 'task' | 'item' | 'supplier' | 'order' | 'request' | 'person' | 'bill';
  title: string;
  detail: string | null;
  href: string;
}

export interface BoardDTO {
  workspaceName: string;
  edition: Edition;
  today: ISODate;
  timezone: string;
  members: { id: string; name: string; title: string | null }[];
  tasks: TaskDTO[];
  restock: RestockDTO[];
  tonight: MealDTO | null;
  week: MealDTO[];
  events: EventDTO[];
}

export interface RealtimeEvent {
  scopes: string[];
  actorId: string | null;
  actorName: string | null;
  summary: string | null;
  at: string;
  /** Set when only managers may see who did what. */
  audience?: 'managers';
}

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}
