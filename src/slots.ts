import { addDays, formatInZone, parseDate, parseTime, weekdayOf, zonedTimeToUtc } from './zone.js';

export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

/** Opening window in local wall-clock time, e.g. ['09:00', '17:00']. '24:00' means end of day. */
export type TimeRange = readonly [start: string, end: string];

export type BusinessHours = Partial<Record<Weekday, readonly TimeRange[]>>;

export type DateInput = Date | string | number;

export interface Booking {
  start: DateInput;
  end: DateInput;
}

/** A single YYYY-MM-DD date or an inclusive range. */
export type Blackout = string | { from: string; to: string };

export interface FindSlotsOptions {
  /** First local date to search, YYYY-MM-DD. */
  from: string;
  /** Last local date to search (inclusive), YYYY-MM-DD. */
  to: string;
  /** IANA zone the business hours are in, e.g. 'Europe/Berlin'. */
  timeZone: string;
  hours: BusinessHours;
  slotMinutes: number;
  /** Distance between slot starts. Defaults to slotMinutes. */
  stepMinutes?: number;
  /** Minutes to keep free before each existing booking. */
  bufferBefore?: number;
  /** Minutes to keep free after each existing booking. */
  bufferAfter?: number;
  bookings?: readonly Booking[];
  blackouts?: readonly Blackout[];
  /** Per-date hours that replace the weekly hours. An empty array closes the day. */
  overrides?: Readonly<Record<string, readonly TimeRange[]>>;
  /** Slots starting before now + minNoticeMinutes are dropped. */
  now?: DateInput;
  minNoticeMinutes?: number;
  maxPerDay?: number;
}

export interface Slot {
  start: Date;
  end: Date;
  /** Local date of the slot start in the business zone. */
  date: string;
  /** Local start time in the business zone, HH:mm. */
  time: string;
}

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MINUTE = 60_000;
const MAX_DAYS = 366;

function toMs(value: DateInput, label: string): number {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(ms)) throw new TypeError(`Invalid ${label}: ${String(value)}`);
  return ms;
}

function positive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be > 0`);
  return value;
}

function nonNegative(value: number | undefined, label: string) {
  const v = value ?? 0;
  if (!Number.isFinite(v) || v < 0) throw new RangeError(`${label} must be >= 0`);
  return v;
}

function isBlackedOut(date: string, blackouts: readonly Blackout[]): boolean {
  return blackouts.some((b) =>
    typeof b === 'string' ? b === date : date >= b.from && date <= b.to,
  );
}

/** Returns every open slot in the date range, sorted by start time. */
export function findSlots(options: FindSlotsOptions): Slot[] {
  const { from, to, timeZone, hours, overrides = {}, blackouts = [] } = options;
  parseDate(from);
  parseDate(to);
  if (from > to) throw new RangeError('`from` must not be after `to`');
  if (addDays(from, MAX_DAYS) <= to) throw new RangeError(`Range is limited to ${MAX_DAYS} days`);
  for (const b of blackouts) {
    for (const d of typeof b === 'string' ? [b] : [b.from, b.to]) parseDate(d);
  }

  const slotMs = positive(options.slotMinutes, 'slotMinutes') * MINUTE;
  const stepMs = positive(options.stepMinutes ?? options.slotMinutes, 'stepMinutes') * MINUTE;
  const before = nonNegative(options.bufferBefore, 'bufferBefore') * MINUTE;
  const after = nonNegative(options.bufferAfter, 'bufferAfter') * MINUTE;
  const notice = nonNegative(options.minNoticeMinutes, 'minNoticeMinutes') * MINUTE;
  const earliest = options.now === undefined ? -Infinity : toMs(options.now, 'now') + notice;
  const maxPerDay = options.maxPerDay ?? Infinity;

  // Each booking blocks its own time plus the buffers around it.
  const busy = (options.bookings ?? [])
    .map((b) => {
      const start = toMs(b.start, 'booking start');
      const end = toMs(b.end, 'booking end');
      if (end < start) throw new RangeError('Booking ends before it starts');
      return [start - before, end + after] as const;
    })
    .sort((a, b) => a[0] - b[0]);

  const slots: Slot[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (isBlackedOut(date, blackouts)) continue;
    const ranges = overrides[date] ?? hours[WEEKDAYS[weekdayOf(date)]!] ?? [];
    let count = 0;

    for (const [open, close] of ranges) {
      parseTime(open);
      const end = parseTime(close);
      const startMs = zonedTimeToUtc(date, open, timeZone).getTime();
      const endMs =
        end.hours === 24
          ? zonedTimeToUtc(addDays(date, 1), '00:00', timeZone).getTime()
          : zonedTimeToUtc(date, close, timeZone).getTime();
      if (endMs <= startMs) throw new RangeError(`Invalid range ${open}-${close} on ${date}`);

      for (let s = startMs; s + slotMs <= endMs && count < maxPerDay; s += stepMs) {
        const e = s + slotMs;
        if (s < earliest) continue;
        if (busy.some(([bs, be]) => s < be && e > bs)) continue;
        const start = new Date(s);
        slots.push({ start, end: new Date(e), ...formatInZone(start, timeZone) });
        count++;
      }
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Groups slots by their local date. */
export function groupByDate(slots: readonly Slot[]): Record<string, Slot[]> {
  const out: Record<string, Slot[]> = {};
  for (const slot of slots) (out[slot.date] ??= []).push(slot);
  return out;
}
