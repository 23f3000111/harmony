/** Calendar dates travel as plain YYYY-MM-DD strings, so a due date never shifts between time zones. */
export type ISODate = string;

const DAY_MS = 86_400_000;

export const toUTC = (date: ISODate) => new Date(`${date}T00:00:00Z`);
export const fromUTC = (date: Date): ISODate => date.toISOString().slice(0, 10);

export const addDays = (date: ISODate, days: number): ISODate => fromUTC(new Date(toUTC(date).getTime() + days * DAY_MS));

export const diffDays = (later: ISODate, earlier: ISODate): number =>
  Math.round((toUTC(later).getTime() - toUTC(earlier).getTime()) / DAY_MS);

export const lastDayOfMonth = (year: number, month0: number) => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();

/** Moves by whole months and keeps `anchorDay` when the month is long enough (31 Jan, 28 Feb, 31 Mar). */
export function addMonths(date: ISODate, months: number, anchorDay?: number): ISODate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month0 = total - year * 12;
  const day = Math.min(anchorDay ?? d, lastDayOfMonth(year, month0));
  return fromUTC(new Date(Date.UTC(year, month0, day)));
}

/** Monday is day 0. */
export const weekdayIndex = (date: ISODate) => (toUTC(date).getUTCDay() + 6) % 7;
export const startOfWeek = (date: ISODate) => addDays(date, -weekdayIndex(date));

export const monthKey = (date: ISODate) => date.slice(0, 7);
export function monthRange(key: string): { start: ISODate; end: ISODate } {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const end = lastDayOfMonth(y, m - 1);
  return { start: `${key}-01`, end: `${key}-${String(end).padStart(2, '0')}` };
}
export const addMonthKey = (key: string, months: number) => monthKey(addMonths(`${key}-01`, months));

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Today as seen in a workspace's own time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, formatter);
  }
  return formatter.format(now);
}

/** ISO-8601 week key such as 2026-W45. */
export function isoWeekKey(date: ISODate): string {
  const thursday = addDays(startOfWeek(date), 3);
  const year = thursday.slice(0, 4);
  const week = Math.floor(diffDays(thursday, `${year}-01-01`) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function dateRange(start: ISODate, days: number): ISODate[] {
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}
