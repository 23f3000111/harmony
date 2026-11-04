import { addDays, diffDays, ISODate } from './dates';

export interface UsageMovement {
  delta: number;
  reason: string;
  on: ISODate;
}

export interface ForecastInput {
  quantity: number;
  minQty: number;
  targetQty?: number | null;
  unitCostCents?: number | null;
  leadTimeDays?: number | null;
  /** Already ordered and still to arrive. It doesn't delay the run-out date, but it does reduce what to buy. */
  onOrder?: number | null;
}

export interface Forecast {
  /** Average units used per day. Zero means there isn't enough history to say. */
  dailyUsage: number;
  daysLeft: number | null;
  runsOutOn: ISODate | null;
  /** Latest day to order so stock arrives before it runs out. */
  orderBy: ISODate | null;
  /** Whole units to buy so stock lasts the horizon and stays above the minimum. */
  suggestedQty: number;
  suggestedCostCents: number;
  status: 'out' | 'low' | 'soon' | 'ok';
}

const MIN_WINDOW_DAYS = 14;

/** Average use over the recent window. Short histories are spread over at least two weeks so one big day can't skew it. */
export function usagePerDay(movements: UsageMovement[], today: ISODate, windowDays = 60): number {
  const windowStart = addDays(today, -windowDays);
  const used = movements.filter((m) => m.reason === 'used' && m.delta < 0 && m.on >= windowStart && m.on <= today);
  if (used.length === 0) return 0;
  const earliest = used.reduce((min, m) => (m.on < min ? m.on : min), today);
  const span = Math.max(MIN_WINDOW_DAYS, Math.min(windowDays, diffDays(today, earliest) + 1));
  const total = used.reduce((sum, m) => sum - m.delta, 0);
  return total / span;
}

export function forecastItem(item: ForecastInput, movements: UsageMovement[], today: ISODate, horizonDays = 30): Forecast {
  const dailyUsage = usagePerDay(movements, today);
  const daysLeft = dailyUsage > 0 ? Math.floor(item.quantity / dailyUsage) : null;
  const runsOutOn = daysLeft === null ? null : addDays(today, daysLeft);
  const orderBy = runsOutOn ? addDays(runsOutOn, -(item.leadTimeDays ?? 0)) : null;

  const neededForHorizon = dailyUsage * horizonDays + item.minQty;
  const topUp = item.targetQty != null && item.quantity <= item.minQty ? item.targetQty : 0;
  const suggestedQty = Math.max(0, Math.ceil(Math.max(neededForHorizon, topUp) - item.quantity - (item.onOrder ?? 0)));
  const suggestedCostCents = Math.round(suggestedQty * (item.unitCostCents ?? 0));

  let status: Forecast['status'] = 'ok';
  if (item.quantity <= 0) status = 'out';
  else if (item.quantity <= item.minQty) status = 'low';
  else if (daysLeft !== null && daysLeft <= Math.max(14, item.leadTimeDays ?? 0)) status = 'soon';

  return { dailyUsage, daysLeft, runsOutOn, orderBy, suggestedQty, suggestedCostCents, status };
}

/** How full the container looks: 1 is at or above target, 0 is empty. */
export function stockLevel(quantity: number, minQty: number, targetQty?: number | null): number {
  const full = targetQty && targetQty > 0 ? targetQty : Math.max(minQty * 2, quantity, 1);
  return Math.max(0, Math.min(1, quantity / full));
}
