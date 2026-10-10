import { describe, expect, it } from 'vitest';
import { findSlots, groupByDate, type FindSlotsOptions } from '../src/index.js';

const weekdays = {
  mon: [['09:00', '17:00']],
  tue: [['09:00', '17:00']],
  wed: [['09:00', '17:00']],
  thu: [['09:00', '17:00']],
  fri: [['09:00', '17:00']],
} as const;

const base: FindSlotsOptions = {
  from: '2026-10-12', // Monday
  to: '2026-10-12',
  timeZone: 'America/New_York',
  hours: weekdays,
  slotMinutes: 60,
};

const times = (opts: Partial<FindSlotsOptions>) =>
  findSlots({ ...base, ...opts }).map((s) => s.time);

describe('findSlots', () => {
  it('splits business hours into slots', () => {
    const slots = findSlots(base);
    expect(slots.map((s) => s.time)).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
    ]);
    expect(slots[0]).toEqual({
      start: new Date('2026-10-12T13:00:00Z'),
      end: new Date('2026-10-12T14:00:00Z'),
      date: '2026-10-12',
      time: '09:00',
    });
  });

  it('supports a step smaller than the slot', () => {
    expect(
      times({ hours: { mon: [['09:00', '10:30']] }, slotMinutes: 60, stepMinutes: 15 }),
    ).toEqual(['09:00', '09:15', '09:30']);
  });

  it('supports split days', () => {
    expect(
      times({
        hours: {
          mon: [
            ['09:00', '11:00'],
            ['13:00', '14:00'],
          ],
        },
      }),
    ).toEqual(['09:00', '10:00', '13:00']);
  });

  it('skips closed weekdays', () => {
    expect(findSlots({ ...base, from: '2026-10-10', to: '2026-10-11' })).toEqual([]);
  });

  it('removes slots that overlap bookings', () => {
    expect(
      times({
        bookings: [
          { start: '2026-10-12T14:30:00Z', end: '2026-10-12T15:00:00Z' }, // 10:30-11:00 local
          { start: new Date('2026-10-12T19:00:00Z'), end: new Date('2026-10-12T20:00:00Z') }, // 15:00-16:00
        ],
      }),
    ).toEqual(['09:00', '11:00', '12:00', '13:00', '14:00', '16:00']);
  });

  it('treats touching bookings as free', () => {
    expect(
      times({ bookings: [{ start: '2026-10-12T13:00:00Z', end: '2026-10-12T14:00:00Z' }] })[0],
    ).toBe('10:00');
  });

  it('applies buffers around bookings', () => {
    const bookings = [{ start: '2026-10-12T16:00:00Z', end: '2026-10-12T17:00:00Z' }]; // 12:00-13:00
    expect(times({ bookings, bufferBefore: 15, bufferAfter: 30 })).toEqual([
      '09:00',
      '10:00',
      '14:00',
      '15:00',
      '16:00',
    ]);
  });

  it('skips blackout dates and ranges', () => {
    const week = { ...base, from: '2026-10-12', to: '2026-10-16' };
    const dates = (b: FindSlotsOptions['blackouts']) =>
      Object.keys(groupByDate(findSlots({ ...week, blackouts: b })));
    expect(dates(['2026-10-13'])).toEqual(['2026-10-12', '2026-10-14', '2026-10-15', '2026-10-16']);
    expect(dates([{ from: '2026-10-13', to: '2026-10-15' }])).toEqual(['2026-10-12', '2026-10-16']);
  });

  it('applies per-date overrides', () => {
    const slots = findSlots({
      ...base,
      from: '2026-10-10',
      to: '2026-10-12',
      overrides: { '2026-10-10': [['10:00', '12:00']], '2026-10-12': [] },
    });
    expect(slots.map((s) => `${s.date} ${s.time}`)).toEqual([
      '2026-10-10 10:00',
      '2026-10-10 11:00',
    ]);
  });

  it('respects now and minimum notice', () => {
    expect(times({ now: '2026-10-12T15:10:00Z', minNoticeMinutes: 60 })).toEqual([
      '13:00',
      '14:00',
      '15:00',
      '16:00',
    ]);
  });

  it('caps slots per day', () => {
    expect(times({ maxPerDay: 2 })).toEqual(['09:00', '10:00']);
  });

  it('supports windows that run to midnight', () => {
    expect(times({ hours: { mon: [['22:00', '24:00']] } })).toEqual(['22:00', '23:00']);
  });

  it('works in half-hour offset zones', () => {
    const slots = findSlots({
      ...base,
      timeZone: 'Asia/Kolkata',
      hours: { mon: [['09:00', '10:00']] },
    });
    expect(slots[0]?.start.toISOString()).toBe('2026-10-12T03:30:00.000Z');
  });

  it('validates input', () => {
    expect(() => findSlots({ ...base, slotMinutes: 0 })).toThrow(RangeError);
    expect(() => findSlots({ ...base, from: '2026-10-13', to: '2026-10-12' })).toThrow(RangeError);
    expect(() => findSlots({ ...base, to: '2028-01-01' })).toThrow(/limited/);
    expect(() => findSlots({ ...base, hours: { mon: [['17:00', '09:00']] } })).toThrow(RangeError);
    expect(() => findSlots({ ...base, bufferAfter: -5 })).toThrow(RangeError);
    expect(() => findSlots({ ...base, blackouts: ['tomorrow'] })).toThrow(TypeError);
    expect(() => findSlots({ ...base, bookings: [{ start: 'nope', end: 'nope' }] })).toThrow(
      TypeError,
    );
  });
});

describe('findSlots across DST', () => {
  it('keeps local hours on the days around spring forward (New York, 2026-03-08)', () => {
    const slots = findSlots({
      ...base,
      from: '2026-03-06',
      to: '2026-03-09',
      hours: { ...weekdays, sun: [['09:00', '11:00']] },
    });
    const byDate = groupByDate(slots);
    expect(byDate['2026-03-06']?.[0]?.start.toISOString()).toBe('2026-03-06T14:00:00.000Z'); // EST
    expect(byDate['2026-03-08']?.map((s) => s.start.toISOString())).toEqual([
      '2026-03-08T13:00:00.000Z', // EDT
      '2026-03-08T14:00:00.000Z',
    ]);
    expect(byDate['2026-03-09']?.[0]?.start.toISOString()).toBe('2026-03-09T13:00:00.000Z');
    expect(byDate['2026-03-09']).toHaveLength(8);
  });

  it('keeps local hours on the days around fall back (Berlin, 2026-10-25)', () => {
    const slots = findSlots({
      ...base,
      timeZone: 'Europe/Berlin',
      from: '2026-10-23',
      to: '2026-10-26',
      hours: { fri: [['09:00', '10:00']], sun: [['09:00', '10:00']], mon: [['09:00', '10:00']] },
    });
    expect(slots.map((s) => [s.date, s.time, s.start.toISOString()])).toEqual([
      ['2026-10-23', '09:00', '2026-10-23T07:00:00.000Z'], // CEST
      ['2026-10-25', '09:00', '2026-10-25T08:00:00.000Z'], // CET
      ['2026-10-26', '09:00', '2026-10-26T08:00:00.000Z'],
    ]);
  });

  it('counts real elapsed time through the spring-forward gap', () => {
    // 00:00-04:00 on the night clocks jump is only three hours long
    const slots = findSlots({
      ...base,
      from: '2026-03-08',
      to: '2026-03-08',
      hours: { sun: [['00:00', '04:00']] },
    });
    expect(slots.map((s) => s.time)).toEqual(['00:00', '01:00', '03:00']);
  });

  it('counts real elapsed time through the fall-back overlap', () => {
    // 00:00-03:00 on the night clocks fall back is four hours long; 01:00 shows up twice
    const slots = findSlots({
      ...base,
      from: '2026-11-01',
      to: '2026-11-01',
      hours: { sun: [['00:00', '03:00']] },
    });
    expect(slots.map((s) => s.time)).toEqual(['00:00', '01:00', '01:00', '02:00']);
  });

  it('respects bookings that straddle a DST change', () => {
    const slots = findSlots({
      ...base,
      from: '2026-11-01',
      to: '2026-11-01',
      hours: { sun: [['00:00', '03:00']] },
      bookings: [{ start: '2026-11-01T05:00:00Z', end: '2026-11-01T06:30:00Z' }], // first 01:00 (EDT) to the second 01:30 (EST)
    });
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      '2026-11-01T04:00:00.000Z',
      '2026-11-01T07:00:00.000Z',
    ]);
  });
});
