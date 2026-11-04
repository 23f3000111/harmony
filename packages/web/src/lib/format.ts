import { diffDays, toUTC, type ISODate } from '@harmony/shared';

export function money(cents: number, currency = 'MYR', options: { compact?: boolean; whole?: boolean } = {}): string {
  const value = cents / 100;
  const label = currency === 'MYR' ? 'RM' : `${currency} `;
  if (options.compact && Math.abs(value) >= 10_000) {
    return `${label}${new Intl.NumberFormat('en-MY', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`;
  }
  const digits = options.whole ? 0 : 2;
  return `${label}${new Intl.NumberFormat('en-MY', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}`;
}

export const qty = (value: number) => new Intl.NumberFormat('en-MY', { maximumFractionDigits: 2 }).format(value);

const short = new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortWeekday = new Intl.DateTimeFormat('en-MY', { weekday: 'short', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('en-MY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const monthName = new Intl.DateTimeFormat('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = new Intl.DateTimeFormat('en-MY', { month: 'short', timeZone: 'UTC' });

export const dayMonth = (date: ISODate) => short.format(toUTC(date));
export const weekday = (date: ISODate) => shortWeekday.format(toUTC(date));
export const fullDate = (date: ISODate) => longDate.format(toUTC(date));
export const monthLabel = (key: string) => monthName.format(toUTC(`${key}-01`));
export const monthAbbr = (key: string) => monthShort.format(toUTC(`${key}-01`));
export const dayNumber = (date: ISODate) => Number(date.slice(8, 10));

/** "Today", "Tomorrow", "Fri", or a date once it's further away. */
export function relativeDay(date: ISODate, today: ISODate): string {
  const days = diffDays(date, today);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days < 7) return weekday(date);
  return dayMonth(date);
}

export function dueLabel(date: ISODate, today: ISODate): string {
  const days = diffDays(date, today);
  if (days < -1) return `${-days} days late`;
  if (days === -1) return '1 day late';
  return relativeDay(date, today);
}

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return short.format(new Date(iso));
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export const minutesLabel = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
};

export function greeting(timeZone: string, now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone }).format(now));
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export const cents = (value: string) => Math.round(Number(value || 0) * 100);
export const toAmount = (value: number) => (value ? (value / 100).toFixed(2) : '');
