import { describe, expect, it } from 'vitest';
import { addMonths, isoWeekKey, monthRange, startOfWeek, todayIn } from '../src/dates';
import { forecastItem, stockLevel, usagePerDay } from '../src/forecast';
import { nextOccurrence, nextOccurrenceAfter, occurrencesBetween } from '../src/recurrence';

describe('dates', () => {
  it('keeps the anchor day when moving through short months', () => {
    expect(addMonths('2026-01-31', 1, 31)).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-11-04')).toBe('2026-11-02');
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02');
    expect(startOfWeek('2026-11-09')).toBe('2026-11-09');
  });

  it('builds ISO week keys across a year end', () => {
    expect(isoWeekKey('2026-11-04')).toBe('2026-W45');
    expect(isoWeekKey('2026-12-31')).toBe('2026-W53');
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
    expect(isoWeekKey('2027-01-04')).toBe('2027-W01');
  });

  it('finds the last day of a month, including leap years', () => {
    expect(monthRange('2028-02').end).toBe('2028-02-29');
    expect(monthRange('2026-11')).toEqual({ start: '2026-11-01', end: '2026-11-30' });
  });

  it('reads today in the workspace time zone', () => {
    const lateUtc = new Date('2026-11-03T18:30:00Z');
    expect(todayIn('Asia/Kuala_Lumpur', lateUtc)).toBe('2026-11-04');
    expect(todayIn('UTC', lateUtc)).toBe('2026-11-03');
  });
});

describe('recurrence', () => {
  it('skips the weekend for weekday repeats', () => {
    expect(nextOccurrence('2026-11-06', 'weekdays')).toBe('2026-11-09');
    expect(nextOccurrence('2026-11-07', 'weekdays')).toBe('2026-11-09');
    expect(nextOccurrence('2026-11-04', 'weekdays')).toBe('2026-11-05');
  });

  it('never repeats a one-off', () => {
    expect(nextOccurrence('2026-11-04', 'none')).toBeNull();
  });

  it('jumps past today when a repeating task was finished late', () => {
    expect(nextOccurrenceAfter('2026-10-01', 'weekly', '2026-11-04')).toBe('2026-11-05');
  });

  it('moves a repeat forward even when finished early', () => {
    expect(nextOccurrenceAfter('2026-11-10', 'weekly', '2026-11-04')).toBe('2026-11-17');
  });

  it('holds on to the 31st through a monthly series', () => {
    const dates = occurrencesBetween('2026-01-31', 'monthly', '2026-01-01', '2026-04-30', 31);
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('lists only the occurrences inside the window', () => {
    expect(occurrencesBetween('2026-11-02', 'weekly', '2026-11-10', '2026-11-30')).toEqual(['2026-11-16', '2026-11-23', '2026-11-30']);
  });
});

describe('forecast', () => {
  const today = '2026-11-04';
  const used = (delta: number, on: string) => ({ delta, on, reason: 'used' });

  it('averages only what was used in the window', () => {
    const rate = usagePerDay(
      [used(-30, '2026-10-05'), used(-30, '2026-10-20'), { delta: 100, on: '2026-10-21', reason: 'restocked' }, used(-999, '2026-01-01')],
      today,
    );
    expect(rate).toBeCloseTo(60 / 31, 5);
  });

  it('reports no usage rather than inventing one', () => {
    const forecast = forecastItem({ quantity: 5, minQty: 1 }, [], today);
    expect(forecast.dailyUsage).toBe(0);
    expect(forecast.daysLeft).toBeNull();
    expect(forecast.runsOutOn).toBeNull();
    expect(forecast.status).toBe('ok');
  });

  it('predicts a run-out date and when to order by', () => {
    const movements = Array.from({ length: 30 }, (_, i) => used(-1, `2026-10-${String(i + 1).padStart(2, '0')}`));
    const forecast = forecastItem({ quantity: 10, minQty: 2, unitCostCents: 500, leadTimeDays: 3 }, movements, today);
    expect(forecast.dailyUsage).toBeCloseTo(30 / 35, 5);
    expect(forecast.daysLeft).toBe(11);
    expect(forecast.runsOutOn).toBe('2026-11-15');
    expect(forecast.orderBy).toBe('2026-11-12');
    expect(forecast.status).toBe('soon');
    expect(forecast.suggestedQty).toBe(Math.ceil((30 / 35) * 30 + 2 - 10));
    expect(forecast.suggestedCostCents).toBe(forecast.suggestedQty * 500);
  });

  it('flags low and empty stock from the minimum level', () => {
    expect(forecastItem({ quantity: 1, minQty: 2 }, [], today).status).toBe('low');
    expect(forecastItem({ quantity: 0, minQty: 2 }, [], today).status).toBe('out');
  });

  it('tops up to the target when stock is low with no usage history', () => {
    const forecast = forecastItem({ quantity: 1, minQty: 2, targetQty: 6, unitCostCents: 100 }, [], today);
    expect(forecast.suggestedQty).toBe(5);
    expect(forecast.suggestedCostCents).toBe(500);
  });

  it('subtracts stock already on order from what to buy, without moving the run-out date', () => {
    const movements = Array.from({ length: 30 }, (_, i) => used(-1, `2026-10-${String(i + 1).padStart(2, '0')}`));
    const without = forecastItem({ quantity: 10, minQty: 2 }, movements, today);
    const withOrder = forecastItem({ quantity: 10, minQty: 2, onOrder: 5 }, movements, today);
    expect(withOrder.runsOutOn).toBe(without.runsOutOn);
    expect(withOrder.suggestedQty).toBe(without.suggestedQty - 5);
    expect(forecastItem({ quantity: 10, minQty: 2, onOrder: 500 }, movements, today).suggestedQty).toBe(0);
  });

  it('keeps the shelf level between empty and full', () => {
    expect(stockLevel(3, 2, 6)).toBe(0.5);
    expect(stockLevel(9, 2, 6)).toBe(1);
    expect(stockLevel(0, 2)).toBe(0);
    expect(stockLevel(2, 2)).toBe(0.5);
  });
});
