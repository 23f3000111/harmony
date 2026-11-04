import {
  BarChart3,
  Boxes,
  CalendarRange,
  ClipboardCheck,
  Inbox,
  LayoutDashboard,
  ListChecks,
  ReceiptText,
  Settings,
  ShoppingBasket,
  Truck,
  UsersRound,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { canManage, canSeeMoney, FEATURES, VOCABULARY, type Edition, type Role } from '@harmony/shared';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the phone tab bar, which has room for four. */
  primary?: boolean;
}

export function navFor(edition: Edition, role: Role): NavItem[] {
  const vocab = VOCABULARY[edition];
  const features = FEATURES[edition];
  const money = canSeeMoney(role);
  const manager = canManage(role);
  const items: (NavItem | false)[] = [
    { to: '', label: vocab.home, icon: LayoutDashboard, primary: true },
    { to: 'tasks', label: vocab.tasks, icon: ListChecks, primary: true },
    { to: 'restock', label: vocab.restock, icon: ShoppingBasket, primary: edition !== 'supply' },
    features.requests && { to: 'requests', label: vocab.requests, icon: Inbox, primary: edition === 'supply' },
    features.orders && manager && { to: 'orders', label: 'Purchase orders', icon: ReceiptText },
    { to: 'items', label: vocab.items, icon: Boxes, primary: true },
    features.suppliers && { to: 'suppliers', label: 'Suppliers', icon: Truck },
    features.meals && { to: 'meals', label: 'Meal plan', icon: UtensilsCrossed },
    { to: 'month', label: vocab.month, icon: CalendarRange },
    money && { to: 'spending', label: vocab.spending, icon: edition === 'home' ? Wallet : BarChart3 },
    { to: 'checklists', label: vocab.checklists, icon: ClipboardCheck },
    { to: 'people', label: vocab.people, icon: UsersRound },
    { to: 'settings', label: 'Settings', icon: Settings },
  ];
  return items.filter((item): item is NavItem => Boolean(item));
}
