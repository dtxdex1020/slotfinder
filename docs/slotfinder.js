// src/zone.ts
var formatters = /* @__PURE__ */ new Map();
function formatter(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    formatters.set(timeZone, f);
  }
  return f;
}
function zonedParts(date, timeZone) {
  const parts = {};
  for (const p of formatter(timeZone).formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    // Some engines still report midnight as 24.
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}
function getTimeZoneOffset(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const whole = Math.floor(date.getTime() / 1e3) * 1e3;
  return Math.round((asUtc - whole) / 6e4);
}
function zonedTimeToUtc(date, time, timeZone) {
  const { year, month, day } = parseDate(date);
  const { hours, minutes } = parseTime(time);
  const local = Date.UTC(year, month - 1, day, hours, minutes);
  const offsetAt = (ms) => getTimeZoneOffset(new Date(ms), timeZone) * 6e4;
  const o1 = offsetAt(local);
  const guess = local - o1;
  const o2 = offsetAt(guess);
  if (o1 === o2) return new Date(guess);
  const retry = local - o2;
  const o3 = offsetAt(retry);
  if (o2 === o3) return new Date(retry);
  return new Date(local - Math.min(o2, o3));
}
var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
var TIME_RE = /^(\d{2}):(\d{2})$/;
function parseDate(value) {
  const m = DATE_RE.exec(value);
  if (!m) throw new TypeError(`Invalid date "${value}", expected YYYY-MM-DD`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new TypeError(`Invalid date "${value}"`);
  }
  return { year, month, day };
}
function parseTime(value) {
  const m = TIME_RE.exec(value);
  const hours = Number(m?.[1]);
  const minutes = Number(m?.[2]);
  if (!m || minutes > 59 || hours > 24 || hours === 24 && minutes !== 0) {
    throw new TypeError(`Invalid time "${value}", expected HH:mm`);
  }
  return { hours, minutes };
}
function addDays(date, days) {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
function weekdayOf(date) {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
var pad = (n) => String(n).padStart(2, "0");
function formatInZone(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`
  };
}

// src/slots.ts
var WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
var MINUTE = 6e4;
var MAX_DAYS = 366;
function toMs(value, label) {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(ms)) throw new TypeError(`Invalid ${label}: ${String(value)}`);
  return ms;
}
function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be > 0`);
  return value;
}
function nonNegative(value, label) {
  const v = value ?? 0;
  if (!Number.isFinite(v) || v < 0) throw new RangeError(`${label} must be >= 0`);
  return v;
}
function isBlackedOut(date, blackouts) {
  return blackouts.some(
    (b) => typeof b === "string" ? b === date : date >= b.from && date <= b.to
  );
}
function findSlots(options) {
  const { from, to, timeZone, hours, overrides = {}, blackouts = [] } = options;
  parseDate(from);
  parseDate(to);
  if (from > to) throw new RangeError("`from` must not be after `to`");
  if (addDays(from, MAX_DAYS) <= to) throw new RangeError(`Range is limited to ${MAX_DAYS} days`);
  for (const b of blackouts) {
    for (const d of typeof b === "string" ? [b] : [b.from, b.to]) parseDate(d);
  }
  const slotMs = positive(options.slotMinutes, "slotMinutes") * MINUTE;
  const stepMs = positive(options.stepMinutes ?? options.slotMinutes, "stepMinutes") * MINUTE;
  const before = nonNegative(options.bufferBefore, "bufferBefore") * MINUTE;
  const after = nonNegative(options.bufferAfter, "bufferAfter") * MINUTE;
  const notice = nonNegative(options.minNoticeMinutes, "minNoticeMinutes") * MINUTE;
  const earliest = options.now === void 0 ? -Infinity : toMs(options.now, "now") + notice;
  const maxPerDay = options.maxPerDay ?? Infinity;
  const busy = (options.bookings ?? []).map((b) => {
    const start = toMs(b.start, "booking start");
    const end = toMs(b.end, "booking end");
    if (end < start) throw new RangeError("Booking ends before it starts");
    return [start - before, end + after];
  }).sort((a, b) => a[0] - b[0]);
  const slots = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (isBlackedOut(date, blackouts)) continue;
    const ranges = overrides[date] ?? hours[WEEKDAYS[weekdayOf(date)]] ?? [];
    let count = 0;
    for (const [open, close] of ranges) {
      parseTime(open);
      const end = parseTime(close);
      const startMs = zonedTimeToUtc(date, open, timeZone).getTime();
      const endMs = end.hours === 24 ? zonedTimeToUtc(addDays(date, 1), "00:00", timeZone).getTime() : zonedTimeToUtc(date, close, timeZone).getTime();
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
function groupByDate(slots) {
  var _a;
  const out = {};
  for (const slot of slots) (out[_a = slot.date] ?? (out[_a] = [])).push(slot);
  return out;
}
export {
  findSlots,
  formatInZone,
  getTimeZoneOffset,
  groupByDate,
  zonedParts,
  zonedTimeToUtc
};
