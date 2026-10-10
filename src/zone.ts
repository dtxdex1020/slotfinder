const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    // Throws a RangeError for unknown zones, which is what we want.
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock parts of an instant in the given time zone. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    // Some engines still report midnight as 24.
    hour: parts.hour === 24 ? 0 : parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}

/** Offset of the zone from UTC at the given instant, in minutes (e.g. -240 for EDT). */
export function getTimeZoneOffset(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const whole = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - whole) / 60_000);
}

/**
 * Converts a wall-clock time in a zone to a UTC instant.
 * Times skipped by a DST jump move forward by the size of the jump (02:30 becomes 03:30).
 * Ambiguous times during a fall-back resolve to the first occurrence.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const { year, month, day } = parseDate(date);
  const { hours, minutes } = parseTime(time);
  const local = Date.UTC(year, month - 1, day, hours, minutes);
  const offsetAt = (ms: number) => getTimeZoneOffset(new Date(ms), timeZone) * 60_000;

  const o1 = offsetAt(local);
  const guess = local - o1;
  const o2 = offsetAt(guess);
  if (o1 === o2) return new Date(guess);

  const retry = local - o2;
  const o3 = offsetAt(retry);
  if (o2 === o3) return new Date(retry);

  // In a gap: neither offset round-trips. Use the earlier offset so the time lands after the jump.
  return new Date(local - Math.min(o2, o3));
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

export function parseDate(value: string) {
  const m = DATE_RE.exec(value);
  if (!m) throw new TypeError(`Invalid date "${value}", expected YYYY-MM-DD`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new TypeError(`Invalid date "${value}"`);
  }
  return { year, month, day };
}

export function parseTime(value: string) {
  const m = TIME_RE.exec(value);
  const hours = Number(m?.[1]);
  const minutes = Number(m?.[2]);
  if (!m || minutes > 59 || hours > 24 || (hours === 24 && minutes !== 0)) {
    throw new TypeError(`Invalid time "${value}", expected HH:mm`);
  }
  return { hours, minutes };
}

/** Adds whole calendar days to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date and time strings for an instant in a zone. */
export function formatInZone(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}
