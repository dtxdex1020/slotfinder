import { describe, expect, it } from 'vitest';
import { formatInZone, getTimeZoneOffset, zonedTimeToUtc } from '../src/zone.js';

const iso = (d: Date) => d.toISOString();

describe('zonedTimeToUtc', () => {
  it('converts regular times', () => {
    expect(iso(zonedTimeToUtc('2026-01-15', '09:00', 'America/New_York'))).toBe(
      '2026-01-15T14:00:00.000Z',
    );
    expect(iso(zonedTimeToUtc('2026-07-15', '09:00', 'America/New_York'))).toBe(
      '2026-07-15T13:00:00.000Z',
    );
    expect(iso(zonedTimeToUtc('2026-07-15', '09:00', 'Asia/Kolkata'))).toBe(
      '2026-07-15T03:30:00.000Z',
    );
    expect(iso(zonedTimeToUtc('2026-07-15', '09:00', 'UTC'))).toBe('2026-07-15T09:00:00.000Z');
  });

  it('pushes times inside a spring-forward gap past the jump', () => {
    // New York skips 02:00-03:00 on 2026-03-08
    expect(iso(zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York'))).toBe(
      '2026-03-08T07:30:00.000Z',
    );
    expect(
      formatInZone(zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York'), 'America/New_York'),
    ).toEqual({
      date: '2026-03-08',
      time: '03:30',
    });
  });

  it('picks the first occurrence of an ambiguous fall-back time', () => {
    // 01:30 happens twice in New York on 2026-11-01; the first is EDT (UTC-4)
    expect(iso(zonedTimeToUtc('2026-11-01', '01:30', 'America/New_York'))).toBe(
      '2026-11-01T05:30:00.000Z',
    );
  });

  it('handles midnight on DST days', () => {
    expect(iso(zonedTimeToUtc('2026-03-29', '00:00', 'Europe/Berlin'))).toBe(
      '2026-03-28T23:00:00.000Z',
    );
    expect(iso(zonedTimeToUtc('2026-03-30', '00:00', 'Europe/Berlin'))).toBe(
      '2026-03-29T22:00:00.000Z',
    );
  });

  it('rejects bad input', () => {
    expect(() => zonedTimeToUtc('2026-02-30', '09:00', 'UTC')).toThrow(TypeError);
    expect(() => zonedTimeToUtc('2026-02-01', '9:00', 'UTC')).toThrow(TypeError);
    expect(() => zonedTimeToUtc('2026-02-01', '24:30', 'UTC')).toThrow(TypeError);
    expect(() => zonedTimeToUtc('2026-02-01', '09:00', 'Mars/Olympus')).toThrow(RangeError);
  });
});

describe('getTimeZoneOffset', () => {
  it('returns minutes east of UTC', () => {
    expect(getTimeZoneOffset(new Date('2026-01-01T12:00:00Z'), 'America/New_York')).toBe(-300);
    expect(getTimeZoneOffset(new Date('2026-07-01T12:00:00Z'), 'America/New_York')).toBe(-240);
    expect(getTimeZoneOffset(new Date('2026-07-01T12:00:00Z'), 'Asia/Kathmandu')).toBe(345);
  });
});
