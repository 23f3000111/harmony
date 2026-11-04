export const BRAND = {
  name: 'Harmony',
  tagline: 'One calm place to run a home or an office.',
} as const;

export const EDITIONS = ['home', 'people', 'supply'] as const;
export type Edition = (typeof EDITIONS)[number];

export const ROLES = ['owner', 'manager', 'member'] as const;
export type Role = (typeof ROLES)[number];

export interface EditionInfo {
  name: string;
  audience: string;
  promise: string;
  managerTitle: string;
  memberTitle: string;
  spaceNoun: string;
  namePlaceholder: string;
}

export const EDITION_INFO: Record<Edition, EditionInfo> = {
  home: {
    name: 'Harmony Home',
    audience: 'For families',
    promise: 'Stop keeping your entire household in your head.',
    managerTitle: 'Runs the home',
    memberTitle: 'Family or helper',
    spaceNoun: 'home',
    namePlaceholder: 'The Rahman home',
  },
  people: {
    name: 'Harmony People',
    audience: 'For HR and office managers',
    promise: 'Keep the office stocked, the jobs delegated and the month planned.',
    managerTitle: 'HR manager',
    memberTitle: 'Staff member',
    spaceNoun: 'office',
    namePlaceholder: 'Bayu Creative',
  },
  supply: {
    name: 'Harmony Supply',
    audience: 'For procurement managers',
    promise: 'See what will run out, approve what to buy and track every order.',
    managerTitle: 'Procurement manager',
    memberTitle: 'Requester',
    spaceNoun: 'company',
    namePlaceholder: 'Nusantara Foods',
  },
};

/** Every label that changes between editions lives here, so screens stay edition-neutral. */
export interface Vocabulary {
  home: string;
  tasks: string;
  task: string;
  items: string;
  item: string;
  restock: string;
  restockVerb: string;
  spending: string;
  people: string;
  person: string;
  requests: string;
  request: string;
  checklists: string;
  month: string;
}

export const VOCABULARY: Record<Edition, Vocabulary> = {
  home: {
    home: 'Today',
    tasks: 'Chores',
    task: 'chore',
    items: 'Pantry & supplies',
    item: 'item',
    restock: 'Shopping list',
    restockVerb: 'Bought',
    spending: 'Bills & budget',
    people: 'Family',
    person: 'family member',
    requests: 'Requests',
    request: 'request',
    checklists: 'Routines',
    month: 'Month ahead',
  },
  people: {
    home: 'Overview',
    tasks: 'Job delegation',
    task: 'job',
    items: 'Pantry & cleaning',
    item: 'supply',
    restock: 'Restock list',
    restockVerb: 'Restocked',
    spending: 'Office budget',
    people: 'Team',
    person: 'team member',
    requests: 'Staff requests',
    request: 'request',
    checklists: 'Checklists',
    month: 'Month ahead',
  },
  supply: {
    home: 'Overview',
    tasks: 'Tasks',
    task: 'task',
    items: 'Inventory',
    item: 'stock item',
    restock: 'Restock list',
    restockVerb: 'Restocked',
    spending: 'Spend & budgets',
    people: 'Team',
    person: 'team member',
    requests: 'Purchase requests',
    request: 'purchase request',
    checklists: 'Checklists',
    month: 'Month ahead',
  },
};

export const ITEM_CATEGORIES: Record<Edition, string[]> = {
  home: ['Rice & grains', 'Fresh food', 'Meat & seafood', 'Dairy & eggs', 'Pantry', 'Frozen', 'Drinks', 'Cleaning', 'Personal care', 'Other'],
  people: ['Coffee & tea', 'Snacks', 'Drinks', 'Paper goods', 'Cleaning', 'Stationery', 'First aid', 'Other'],
  supply: ['Packaging', 'Cleaning', 'Pantry', 'Stationery', 'Safety', 'Spare parts', 'IT consumables', 'Other'],
};

export const ITEM_LOCATIONS: Record<Edition, string[]> = {
  home: ['Pantry', 'Fridge', 'Freezer', 'Bathroom', 'Laundry', 'Cleaning cupboard', 'Other'],
  people: ['Level 3 pantry', 'Level 5 pantry', 'Store room', 'Reception', 'Cleaner cupboard', 'Other'],
  supply: ['Main store', 'Cold room', 'Warehouse A', 'Warehouse B', 'Head office', 'Other'],
};

export const SPEND_CATEGORIES: Record<Edition, string[]> = {
  home: ['Groceries', 'Utilities', 'Housing', 'Transport', 'Education', 'Healthcare', 'Household supplies', 'Childcare', 'Family & festive', 'Other'],
  people: ['Pantry', 'Cleaning', 'Stationery', 'Repairs & servicing', 'Utilities', 'Staff events', 'Other'],
  supply: ['Packaging', 'Cleaning', 'Pantry', 'Stationery', 'Safety', 'Spare parts', 'IT consumables', 'Logistics', 'Other'],
};

export const TASK_AREAS: Record<Edition, string[]> = {
  home: ['Kitchen', 'Bathrooms', 'Bedrooms', 'Living areas', 'Laundry', 'Floors', 'Outdoor', 'School', 'Home upkeep', 'Other'],
  people: ['Facilities', 'Cleaning', 'Onboarding', 'Staff events', 'Compliance', 'Admin', 'Other'],
  supply: ['Sourcing', 'Stock take', 'Supplier follow-up', 'Receiving', 'Audit', 'Admin', 'Other'],
};

/** Where a stock purchase lands in the budget. */
export function spendCategoryForItem(edition: Edition, itemCategory: string | null | undefined): string {
  if (edition === 'home') {
    if (itemCategory === 'Cleaning' || itemCategory === 'Personal care') return 'Household supplies';
    return 'Groceries';
  }
  if (edition === 'people') {
    if (itemCategory === 'Cleaning' || itemCategory === 'Paper goods') return 'Cleaning';
    if (itemCategory === 'Stationery') return 'Stationery';
    return 'Pantry';
  }
  if (itemCategory && SPEND_CATEGORIES.supply.includes(itemCategory)) return itemCategory;
  return 'Other';
}

export const roleRank: Record<Role, number> = { member: 1, manager: 2, owner: 3 };

/** Budgets, bills and orders are only shown to people who manage them. */
export const canSeeMoney = (role: Role) => roleRank[role] >= roleRank.manager;
export const canManage = (role: Role) => roleRank[role] >= roleRank.manager;
export const isOwner = (role: Role) => role === 'owner';

export interface EditionFeatures {
  meals: boolean;
  bills: boolean;
  requests: boolean;
  orders: boolean;
  suppliers: boolean;
}

export const FEATURES: Record<Edition, EditionFeatures> = {
  home: { meals: true, bills: true, requests: false, orders: false, suppliers: false },
  people: { meals: false, bills: true, requests: true, orders: false, suppliers: false },
  supply: { meals: false, bills: false, requests: true, orders: true, suppliers: true },
};
