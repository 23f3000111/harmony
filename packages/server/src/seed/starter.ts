import { addDays, anchorDayOf, startOfWeek, type Edition, type Recurrence } from '@harmony/shared';
import type { DB } from '../db/types';
import { bills, checklists, items, recipes, tasks, type MemberRow, type WorkspaceRow } from '../db/schema';

/** [name, category, unit, location, starting quantity, minimum, target, unit cost in sen] */
type ItemRow = [string, string, string, string, number, number, number, number];
/** [title, area, repeats, minutes] */
type TaskRow = [string, string, Recurrence, number];
/** [name, provider, category, day offset for first due date, repeats] */
type BillRow = [string, string, string, number, Recurrence];

const HOME_ITEMS: ItemRow[] = [
  ['Jasmine rice', 'Rice & grains', 'kg', 'Pantry', 10, 2, 10, 450],
  ['Rolled oats', 'Rice & grains', 'kg', 'Pantry', 1, 1, 2, 1200],
  ['Bee hoon', 'Rice & grains', 'pack', 'Pantry', 2, 1, 3, 350],
  ['Spaghetti', 'Rice & grains', 'pack', 'Pantry', 2, 1, 3, 590],
  ['Cooking oil', 'Pantry', 'bottle', 'Pantry', 2, 1, 3, 1290],
  ['Sugar', 'Pantry', 'kg', 'Pantry', 2, 1, 3, 300],
  ['Salt', 'Pantry', 'pack', 'Pantry', 1, 1, 2, 150],
  ['Soy sauce', 'Pantry', 'bottle', 'Pantry', 1, 1, 2, 550],
  ['Oyster sauce', 'Pantry', 'bottle', 'Pantry', 1, 1, 2, 690],
  ['Sambal paste', 'Pantry', 'jar', 'Pantry', 2, 1, 3, 850],
  ['Coconut milk', 'Pantry', 'pack', 'Pantry', 4, 2, 6, 350],
  ['Canned tomatoes', 'Pantry', 'can', 'Pantry', 3, 1, 4, 480],
  ['Ikan bilis', 'Pantry', 'pack', 'Pantry', 1, 1, 2, 1800],
  ['Onions', 'Fresh food', 'kg', 'Pantry', 1, 0.5, 2, 450],
  ['Garlic', 'Fresh food', 'pack', 'Fridge', 1, 1, 2, 400],
  ['Eggs', 'Dairy & eggs', 'pcs', 'Fridge', 20, 6, 30, 55],
  ['UHT milk', 'Dairy & eggs', 'carton', 'Fridge', 3, 2, 6, 720],
  ['Butter', 'Dairy & eggs', 'block', 'Fridge', 1, 1, 2, 1390],
  ['Chicken', 'Meat & seafood', 'kg', 'Freezer', 3, 1, 5, 1100],
  ['Minced beef', 'Meat & seafood', 'pack', 'Freezer', 2, 1, 3, 2200],
  ['Fish fillet', 'Meat & seafood', 'pack', 'Freezer', 2, 1, 3, 1900],
  ['Frozen vegetables', 'Frozen', 'pack', 'Freezer', 2, 1, 3, 950],
  ['Coffee', 'Drinks', 'pack', 'Pantry', 2, 1, 3, 1250],
  ['Tea bags', 'Drinks', 'box', 'Pantry', 1, 1, 2, 950],
  ['Dishwashing liquid', 'Cleaning', 'bottle', 'Cleaning cupboard', 2, 1, 3, 1150],
  ['Laundry detergent', 'Cleaning', 'bottle', 'Laundry', 2, 1, 3, 2290],
  ['Floor cleaner', 'Cleaning', 'bottle', 'Cleaning cupboard', 1, 1, 2, 1390],
  ['Bin liners', 'Cleaning', 'roll', 'Cleaning cupboard', 2, 1, 3, 690],
  ['Toilet rolls', 'Personal care', 'roll', 'Bathroom', 12, 6, 24, 120],
  ['Hand soap', 'Personal care', 'bottle', 'Bathroom', 2, 1, 3, 690],
  ['Toothpaste', 'Personal care', 'tube', 'Bathroom', 2, 1, 3, 890],
  ['Shampoo', 'Personal care', 'bottle', 'Bathroom', 1, 1, 2, 1690],
];

const HOME_TASKS: TaskRow[] = [
  ['Wipe kitchen counters', 'Kitchen', 'daily', 5],
  ['Wash up and clear the sink', 'Kitchen', 'daily', 15],
  ['Take out the rubbish', 'Kitchen', 'daily', 5],
  ['Tidy bedrooms', 'Bedrooms', 'daily', 10],
  ['Run a load of laundry', 'Laundry', 'daily', 10],
  ['Fold and put away laundry', 'Laundry', 'daily', 15],
  ['Check school bags and water bottles', 'School', 'weekdays', 5],
  ['Sweep and mop the kitchen floor', 'Floors', 'weekly', 20],
  ['Clean the stove and hood', 'Kitchen', 'weekly', 20],
  ['Scrub the bathrooms', 'Bathrooms', 'weekly', 30],
  ['Change bath towels', 'Bathrooms', 'weekly', 5],
  ['Vacuum the living areas', 'Floors', 'weekly', 20],
  ['Dust shelves and the TV area', 'Living areas', 'weekly', 15],
  ['Water the plants', 'Outdoor', 'weekly', 5],
  ['Change bed sheets', 'Bedrooms', 'fortnightly', 20],
  ['Clean out the fridge', 'Kitchen', 'monthly', 30],
  ['Clean the washing machine drum', 'Home upkeep', 'monthly', 15],
  ['Service the air conditioners', 'Home upkeep', 'quarterly', 60],
  ['Replace the water filter', 'Home upkeep', 'half_yearly', 15],
  ['Book pest control', 'Home upkeep', 'half_yearly', 10],
];

const HOME_BILLS: BillRow[] = [
  ['Electricity', 'TNB', 'Utilities', 14, 'monthly'],
  ['Water', 'Air Selangor', 'Utilities', 18, 'monthly'],
  ['Sewerage', 'IWK', 'Utilities', 22, 'monthly'],
  ['Home internet', '', 'Utilities', 10, 'monthly'],
  ['Condo maintenance', '', 'Housing', 25, 'monthly'],
  ['Cukai pintu', '', 'Housing', 60, 'half_yearly'],
  ['Cukai tanah', '', 'Housing', 120, 'yearly'],
  ['Road tax', 'JPJ', 'Transport', 90, 'yearly'],
  ['Car insurance', '', 'Transport', 90, 'yearly'],
];

const HOME_RECIPES: { name: string; prep: number; cook: number; serves: number; ingredients: string[] }[] = [
  { name: 'Nasi lemak', prep: 20, cook: 40, serves: 4, ingredients: ['Jasmine rice', 'Coconut milk', 'Sambal paste', 'Eggs', 'Ikan bilis'] },
  { name: 'Ayam masak merah', prep: 20, cook: 40, serves: 4, ingredients: ['Chicken', 'Canned tomatoes', 'Onions', 'Sambal paste'] },
  { name: 'Sup sayur', prep: 10, cook: 20, serves: 4, ingredients: ['Frozen vegetables', 'Onions', 'Garlic'] },
  { name: 'Ikan masak kicap', prep: 10, cook: 20, serves: 4, ingredients: ['Fish fillet', 'Soy sauce', 'Onions'] },
  { name: 'Spaghetti bolognese', prep: 10, cook: 30, serves: 4, ingredients: ['Spaghetti', 'Minced beef', 'Canned tomatoes', 'Onions'] },
  { name: 'Bee hoon goreng', prep: 15, cook: 15, serves: 4, ingredients: ['Bee hoon', 'Eggs', 'Soy sauce', 'Frozen vegetables'] },
  { name: 'Telur dadar and rice', prep: 5, cook: 15, serves: 4, ingredients: ['Jasmine rice', 'Eggs', 'Onions'] },
  { name: 'Chicken porridge', prep: 10, cook: 45, serves: 4, ingredients: ['Jasmine rice', 'Chicken', 'Garlic'] },
];

const SUNDAY_RESET = [
  { id: 'calendar', title: "Review the coming week's commitments", hint: 'School events, late meetings, dinners out.' },
  { id: 'meals', title: 'Plan meals', hint: 'Five dinners is enough. Leave room for leftovers.' },
  { id: 'pantry', title: 'Check the pantry', hint: 'Update anything that looks low.' },
  { id: 'list', title: 'Prepare the shopping list', hint: null },
  { id: 'chores', title: 'Share out household chores', hint: 'Make sure every room has someone.' },
  { id: 'bills', title: 'Review upcoming bills', hint: null },
  { id: 'priorities', title: 'Choose three priorities', hint: 'What would make this week feel calm?' },
];

const PEOPLE_ITEMS: ItemRow[] = [
  ['Coffee beans', 'Coffee & tea', 'kg', 'Level 3 pantry', 4, 1, 5, 6800],
  ['3-in-1 coffee', 'Coffee & tea', 'box', 'Level 3 pantry', 4, 2, 6, 1590],
  ['Tea bags', 'Coffee & tea', 'box', 'Level 3 pantry', 3, 1, 4, 950],
  ['Sugar sticks', 'Coffee & tea', 'box', 'Level 3 pantry', 2, 1, 3, 1200],
  ['Creamer', 'Coffee & tea', 'tin', 'Level 3 pantry', 2, 1, 3, 1450],
  ['Snack biscuits', 'Snacks', 'tin', 'Level 3 pantry', 4, 2, 6, 1890],
  ['Instant noodles', 'Snacks', 'carton', 'Store room', 1, 1, 2, 3200],
  ['Bottled water', 'Drinks', 'carton', 'Store room', 5, 2, 8, 1400],
  ['Paper cups', 'Paper goods', 'sleeve', 'Level 3 pantry', 6, 3, 10, 650],
  ['Tissue boxes', 'Paper goods', 'box', 'Store room', 12, 6, 24, 280],
  ['Toilet rolls', 'Paper goods', 'carton', 'Cleaner cupboard', 2, 1, 3, 4800],
  ['Hand soap', 'Cleaning', 'refill', 'Cleaner cupboard', 3, 1, 4, 1850],
  ['Floor cleaner', 'Cleaning', 'bottle', 'Cleaner cupboard', 2, 1, 3, 1390],
  ['Dishwashing liquid', 'Cleaning', 'bottle', 'Cleaner cupboard', 2, 1, 3, 1150],
  ['Bin liners', 'Cleaning', 'roll', 'Cleaner cupboard', 6, 3, 10, 690],
  ['A4 paper', 'Stationery', 'ream', 'Store room', 15, 5, 25, 1350],
  ['Whiteboard markers', 'Stationery', 'pack', 'Reception', 3, 1, 4, 1250],
  ['Plasters', 'First aid', 'box', 'Reception', 2, 1, 3, 850],
];

const PEOPLE_TASKS: TaskRow[] = [
  ['Check the pantry and update stock', 'Facilities', 'weekly', 15],
  ['Inspect washrooms and restock', 'Cleaning', 'daily', 10],
  ['Clear meeting rooms at end of day', 'Cleaning', 'weekdays', 10],
  ['Monthly fire extinguisher check', 'Compliance', 'monthly', 20],
  ['Service the air conditioners', 'Facilities', 'quarterly', 60],
  ['Renew the pest control contract', 'Facilities', 'yearly', 30],
  ['Restock the first aid box', 'Compliance', 'quarterly', 15],
  ['Prepare the monthly staff birthday list', 'Staff events', 'monthly', 15],
];

const PEOPLE_BILLS: BillRow[] = [
  ['Office cleaning', '', 'Cleaning', 12, 'monthly'],
  ['Water dispenser rental', '', 'Utilities', 16, 'monthly'],
  ['Pest control', '', 'Repairs & servicing', 45, 'quarterly'],
  ['Air conditioner servicing', '', 'Repairs & servicing', 60, 'quarterly'],
];

const ONBOARDING = [
  { id: 'welcome', title: 'Send the welcome email and first-day details', hint: null },
  { id: 'desk', title: 'Set up desk, laptop and access card', hint: null },
  { id: 'accounts', title: 'Create email and software accounts', hint: null },
  { id: 'buddy', title: 'Assign an office buddy', hint: null },
  { id: 'tour', title: 'Give an office tour on day one', hint: 'Fire exits, first aid box and pantry.' },
  { id: 'review', title: 'Book the 30-day check-in', hint: null },
];

const OFFICE_CHECK = [
  { id: 'stock', title: 'Review pantry and cleaning stock', hint: null },
  { id: 'budget', title: 'Compare this month’s spending with the budget', hint: null },
  { id: 'jobs', title: 'Follow up on overdue jobs', hint: null },
  { id: 'servicing', title: 'Book any servicing due next month', hint: null },
  { id: 'events', title: 'Confirm next month’s staff events', hint: null },
];

const SUPPLY_ITEMS: ItemRow[] = [
  ['Packing boxes (medium)', 'Packaging', 'bundle', 'Main store', 20, 5, 30, 4500],
  ['Packing tape', 'Packaging', 'carton', 'Main store', 3, 1, 4, 9600],
  ['Shipping labels', 'Packaging', 'roll', 'Main store', 10, 4, 15, 1800],
  ['Floor degreaser', 'Cleaning', 'can', 'Main store', 4, 2, 6, 5600],
  ['Hand sanitiser', 'Cleaning', 'bottle', 'Head office', 8, 4, 12, 1500],
  ['Coffee', 'Pantry', 'kg', 'Head office', 3, 1, 5, 6800],
  ['A4 paper', 'Stationery', 'ream', 'Head office', 15, 5, 25, 1350],
  ['Nitrile gloves', 'Safety', 'box', 'Main store', 20, 10, 40, 2400],
  ['Safety vests', 'Safety', 'pcs', 'Main store', 10, 5, 15, 1800],
  ['Printer toner', 'IT consumables', 'pcs', 'Head office', 2, 1, 3, 28000],
];

const SUPPLY_TASKS: TaskRow[] = [
  ['Run the month-end stock take', 'Stock take', 'monthly', 120],
  ['Follow up on late deliveries', 'Supplier follow-up', 'weekly', 30],
  ['Review supplier prices', 'Sourcing', 'quarterly', 90],
];

const STOCK_TAKE = [
  { id: 'count', title: 'Count every shelf and enter the differences', hint: null },
  { id: 'expired', title: 'Pull anything expired or damaged', hint: null },
  { id: 'orders', title: 'Chase open purchase orders', hint: null },
  { id: 'budget', title: 'Compare spend with budget by category', hint: null },
  { id: 'plan', title: 'Plan next month’s orders', hint: null },
];

function firstDue(today: string, recurrence: Recurrence): string {
  switch (recurrence) {
    case 'daily':
    case 'weekdays':
      return today;
    case 'weekly':
      return addDays(startOfWeek(today), 5) >= today ? addDays(startOfWeek(today), 5) : addDays(startOfWeek(today), 12);
    case 'fortnightly':
      return addDays(today, 7);
    case 'monthly':
      return addDays(today, 14);
    case 'quarterly':
      return addDays(today, 45);
    default:
      return addDays(today, 90);
  }
}

const STARTERS: Record<Edition, { items: ItemRow[]; tasks: TaskRow[]; bills: BillRow[] }> = {
  home: { items: HOME_ITEMS, tasks: HOME_TASKS, bills: HOME_BILLS },
  people: { items: PEOPLE_ITEMS, tasks: PEOPLE_TASKS, bills: PEOPLE_BILLS },
  supply: { items: SUPPLY_ITEMS, tasks: SUPPLY_TASKS, bills: [] },
};

/** Fills a new workspace with common items and routines, so people edit and delete instead of starting from empty tables. */
export async function applyStarter(db: DB, workspace: WorkspaceRow, owner: MemberRow, today: string) {
  const pack = STARTERS[workspace.edition];

  await db.insert(items).values(
    pack.items.map(([name, category, unit, location, quantity, minQty, targetQty, unitCostCents]) => ({
      workspaceId: workspace.id,
      name,
      category,
      unit,
      location,
      quantity,
      minQty,
      targetQty,
      unitCostCents,
    })),
  );

  await db.insert(tasks).values(
    pack.tasks.map(([title, area, recurrence, estimatedMinutes]) => {
      const dueOn = firstDue(today, recurrence);
      return { workspaceId: workspace.id, title, area, recurrence, estimatedMinutes, dueOn, anchorDay: anchorDayOf(dueOn), createdById: owner.id };
    }),
  );

  if (pack.bills.length) {
    // Amounts stay at zero until someone enters them. Guessing someone's bills would only mislead.
    await db.insert(bills).values(
      pack.bills.map(([name, provider, category, offset, recurrence]) => {
        const dueOn = addDays(today, offset);
        return { workspaceId: workspace.id, name, provider: provider || null, category, amountCents: 0, dueOn, recurrence, anchorDay: anchorDayOf(dueOn) };
      }),
    );
  }

  if (workspace.edition === 'home') {
    await db.insert(recipes).values(
      HOME_RECIPES.map((recipe) => ({
        workspaceId: workspace.id,
        name: recipe.name,
        prepMinutes: recipe.prep,
        cookMinutes: recipe.cook,
        serves: recipe.serves,
        ingredients: recipe.ingredients.map((name) => ({ name })),
      })),
    );
    await db.insert(checklists).values({ workspaceId: workspace.id, name: 'Sunday reset', description: 'Fifteen minutes that set up the week ahead.', cadence: 'weekly', steps: SUNDAY_RESET });
  }
  if (workspace.edition === 'people') {
    await db.insert(checklists).values([
      { workspaceId: workspace.id, name: 'Monthly office check', description: 'A short review that sets up the month ahead.', cadence: 'monthly', steps: OFFICE_CHECK, position: 0 },
      { workspaceId: workspace.id, name: 'New joiner onboarding', description: 'Everything a new starter needs before and on day one.', cadence: 'once', steps: ONBOARDING, position: 1 },
    ]);
  }
  if (workspace.edition === 'supply') {
    await db.insert(checklists).values({ workspaceId: workspace.id, name: 'Month-end stock take', description: 'Close the month with numbers you can trust.', cadence: 'monthly', steps: STOCK_TAKE });
  }
}

export { HOME_RECIPES, ONBOARDING, OFFICE_CHECK, STOCK_TAKE, SUNDAY_RESET };
