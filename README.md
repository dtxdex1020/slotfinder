# slotfinder

[![CI](https://img.shields.io/github/actions/workflow/status/dtxdex1020/slotfinder/ci.yml?branch=main&style=flat-square&label=CI&labelColor=1f4e79)](https://github.com/dtxdex1020/slotfinder/actions/workflows/ci.yml)
[![demo](https://img.shields.io/badge/demo-live-4aa3df?style=flat-square&labelColor=1f4e79)](https://dtxdex1020.github.io/slotfinder/)
[![dependencies](https://img.shields.io/badge/dependencies-0-4aa3df?style=flat-square&labelColor=1f4e79)](./package.json)
[![license](https://img.shields.io/badge/license-MIT-4aa3df?style=flat-square&labelColor=1f4e79)](./LICENSE)

Every booking app needs the same function: "given my hours and what's already booked, when am I free?" It looks like a ten-minute job until a customer in Berlin books across a daylight saving change.

`slotfinder` is that function, done carefully. Business hours, time zones, slot length, buffers, existing bookings, blackout dates, per-day overrides and minimum notice. No dependencies, just the `Intl` API that ships with every modern runtime.

**[Try the live demo](https://dtxdex1020.github.io/slotfinder/)**

## Install

```sh
npm install github:dtxdex1020/slotfinder
```

## Usage

```ts
import { findSlots } from 'slotfinder';

const nineToFive = [['09:00', '17:00']] as const;

const slots = findSlots({
  from: '2026-10-12',
  to: '2026-10-16',
  timeZone: 'America/New_York',
  hours: { mon: nineToFive, tue: nineToFive, wed: nineToFive, thu: nineToFive, fri: nineToFive },
  slotMinutes: 30,
  bufferAfter: 10,
  bookings: [{ start: '2026-10-12T14:00:00Z', end: '2026-10-12T15:00:00Z' }],
  blackouts: ['2026-10-14'],
  now: new Date(),
  minNoticeMinutes: 120,
});

slots[0];
// {
//   start: 2026-10-12T13:00:00.000Z,   // a real instant, safe to store
//   end:   2026-10-12T13:30:00.000Z,
//   date: '2026-10-12',                // local to the business
//   time: '09:00'
// }
```

Group them for a picker UI:

```ts
import { groupByDate } from 'slotfinder';

groupByDate(slots); // { '2026-10-12': [...], '2026-10-13': [...] }
```

### Examples

Lunch break and a short Saturday:

```ts
hours: {
  mon: [['09:00', '12:00'], ['13:00', '17:00']],
  sat: [['10:00', '14:00']],
}
```

Holiday week plus a one-off late day:

```ts
blackouts: [{ from: '2026-12-24', to: '2026-12-31' }],
overrides: { '2026-12-18': [['09:00', '21:00']], '2026-12-19': [] }, // [] closes the day
```

Hour-long slots that start every 15 minutes:

```ts
slotMinutes: 60, stepMinutes: 15
```

## Time zones and DST

Hours are wall-clock times in `timeZone`. Every slot comes back as real `Date` instants plus the local `date` and `time`, so you can store the instant and display either side.

- On a spring-forward day, local times that don't exist move past the jump (`02:30` becomes `03:30`).
- On a fall-back day, ambiguous times use the first occurrence.
- Slots are stepped in real elapsed time, so a 00:00-04:00 window on the night clocks jump really is three hours long.

The test suite pins all of this down for New York and Berlin transitions, plus half-hour zones like `Asia/Kolkata`.

## API

### `findSlots(options): Slot[]`

| Option             | Type                            | Default       | Notes                                   |
| ------------------ | ------------------------------- | ------------- | --------------------------------------- |
| `from`, `to`       | `'YYYY-MM-DD'`                  | required      | Inclusive local dates, up to 366 days   |
| `timeZone`         | `string`                        | required      | Any IANA zone                           |
| `hours`            | `{ mon?: [start, end][], ... }` | required      | `'HH:mm'`, `'24:00'` allowed as an end  |
| `slotMinutes`      | `number`                        | required      | Length of each slot                     |
| `stepMinutes`      | `number`                        | `slotMinutes` | Gap between slot starts                 |
| `bufferBefore`     | `number`                        | `0`           | Minutes kept free before each booking   |
| `bufferAfter`      | `number`                        | `0`           | Minutes kept free after each booking    |
| `bookings`         | `{ start, end }[]`              | `[]`          | `Date`, ISO string or epoch ms          |
| `blackouts`        | `(date \| { from, to })[]`      | `[]`          | Whole days off                          |
| `overrides`        | `Record<date, [start, end][]>`  | `{}`          | Replaces the weekly hours for that date |
| `now`              | `Date \| string \| number`      |               | Drops slots in the past                 |
| `minNoticeMinutes` | `number`                        | `0`           | Used with `now`                         |
| `maxPerDay`        | `number`                        | `Infinity`    | Cap per local day                       |

Returns `{ start: Date, end: Date, date: string, time: string }[]` sorted by start. Bad input throws a `TypeError` or `RangeError` with a readable message.

### Helpers

| Export                             | Description                                         |
| ---------------------------------- | --------------------------------------------------- |
| `groupByDate(slots)`               | `Record<'YYYY-MM-DD', Slot[]>`                      |
| `zonedTimeToUtc(date, time, zone)` | Wall-clock time in a zone to a `Date`               |
| `getTimeZoneOffset(date, zone)`    | Offset in minutes at that instant (`-240` for EDT)  |
| `formatInZone(date, zone)`         | `{ date: 'YYYY-MM-DD', time: 'HH:mm' }`             |
| `zonedParts(date, zone)`           | Year, month, day, hour, minute, second in that zone |

## Why

I kept rewriting this for booking pages and it kept being slightly wrong in a new way: off by an hour twice a year, buffers applied on one side only, a 24:00 close time that crashed things. The usual fix is pulling in a full date library for one function. This is the one function, with tests for the bits that bite.

## Development

```sh
npm install
npm test        # vitest
npm run lint    # eslint + prettier + tsc
npm run build   # ESM + CJS + types, and refreshes docs/slotfinder.js for the demo
```

## License

[MIT](./LICENSE)
