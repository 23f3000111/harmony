import { addDays, addMonths, ISODate, weekdayIndex } from './dates';

export const RECURRENCES = ['none', 'daily', 'weekdays', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'half_yearly', 'yearly'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekdays: 'Every weekday',
  weekly: 'Every week',
  fortnightly: 'Every two weeks',
  monthly: 'Every month',
  quarterly: 'Every three months',
  half_yearly: 'Every six months',
  yearly: 'Every year',
};

export function nextOccurrence(from: ISODate, recurrence: Recurrence, anchorDay?: number | null): ISODate | null {
  const anchor = anchorDay ?? undefined;
  switch (recurrence) {
    case 'none':
      return null;
    case 'daily':
      return addDays(from, 1);
    case 'weekdays': {
      const index = weekdayIndex(from);
      return addDays(from, index >= 4 ? 7 - index : 1);
    }
    case 'weekly':
      return addDays(from, 7);
    case 'fortnightly':
      return addDays(from, 14);
    case 'monthly':
      return addMonths(from, 1, anchor);
    case 'quarterly':
      return addMonths(from, 3, anchor);
    case 'half_yearly':
      return addMonths(from, 6, anchor);
    case 'yearly':
      return addMonths(from, 12, anchor);
  }
}

/** First occurrence later than `after`, so finishing an overdue chore doesn't queue up every missed repeat. */
export function nextOccurrenceAfter(from: ISODate, recurrence: Recurrence, after: ISODate, anchorDay?: number | null): ISODate | null {
  let next = nextOccurrence(from, recurrence, anchorDay);
  while (next && next <= after) next = nextOccurrence(next, recurrence, anchorDay);
  return next;
}

/** Every occurrence of a series inside [start, end], counting `from` itself. */
export function occurrencesBetween(from: ISODate, recurrence: Recurrence, start: ISODate, end: ISODate, anchorDay?: number | null): ISODate[] {
  const dates: ISODate[] = [];
  let current: ISODate | null = from;
  let guard = 0;
  while (current && current <= end && guard < 1000) {
    if (current >= start) dates.push(current);
    current = nextOccurrence(current, recurrence, anchorDay);
    guard += 1;
  }
  return dates;
}

export const anchorDayOf = (date: ISODate | null | undefined) => (date ? Number(date.slice(8, 10)) : null);
