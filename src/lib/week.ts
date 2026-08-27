// Week helpers. A batch now covers a single Mon-Fri week, identified by the
// Monday that starts it.
//
// Everything here works in LOCAL time on purpose. `new Date("2026-09-01")`
// goes through Date's string parser, which reads a bare YYYY-MM-DD as UTC
// midnight — that is the *previous* day anywhere west of Greenwich. A Monday
// would come back as a Sunday and the batches_week_start_is_monday CHECK
// would reject it. So dates are built from explicit year/month/day parts and
// formatted back the same way, never through the string parser.
//
// Day arithmetic goes through the Date constructor's overflow handling
// (`new Date(y, m, d + 7)`), which rolls months and years over correctly and
// is immune to DST — adding milliseconds is not.

// Batch shape. These live here rather than in batch-generation.ts because the
// Generate dialog is a client component: batch-generation.ts reads the content
// skill off disk with `fs` at import time, so pulling a single constant from it
// into the browser bundle breaks the build. This module stays free of
// Node-only imports on purpose — keep it that way.

// A batch covers one Mon-Fri week: five weekdays at two posts a day.
export const SLOTS_PER_WEEK = 10;

// Batch sizes offered in the Generate dialog: one post a weekday, or two.
export const POST_COUNT_PRESETS = [5, 10];
export const DEFAULT_POST_COUNT = 10;

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Parse YYYY-MM-DD into a Date at local midnight. */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Format a Date as YYYY-MM-DD using its local calendar day. */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Shift a Date by whole days, staying on local midnight. */
function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** The Monday of the ISO week containing `d`, as YYYY-MM-DD. */
export function mondayOf(d: Date): string {
  // getDay() is 0=Sun..6=Sat. In an ISO week Sunday is the *last* day, so it
  // belongs to the Monday six days back, not the one tomorrow.
  const offset = d.getDay() === 0 ? -6 : 1 - d.getDay();
  return toISODate(addDays(d, offset));
}

/** The Monday of the ISO week after the one containing `from`. */
export function nextMonday(from: Date = new Date()): string {
  return toISODate(addDays(parseISODate(mondayOf(from)), 7));
}

/** True if `weekStart` is a Monday — what the DB CHECK enforces. */
export function isMonday(weekStart: string): boolean {
  return parseISODate(weekStart).getDay() === 1;
}

/** The weekday `weekStart` actually falls on — for telling the caller off. */
export function dayName(iso: string): string {
  return DAY_NAMES[parseISODate(iso).getDay()];
}

/** True if `iso` is a YYYY-MM-DD calendar date. */
export function isISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  // Round-tripping rejects the impossible: 2026-02-31 parses to 3 March.
  return toISODate(parseISODate(iso)) === iso;
}

/** The five weekday dates of the week starting `weekStart`, YYYY-MM-DD. */
export function weekdaysOf(weekStart: string): string[] {
  const monday = parseISODate(weekStart);
  return Array.from({ length: 5 }, (_, i) => toISODate(addDays(monday, i)));
}

/** A week as "Mon 1 Sep – Fri 5 Sep". */
export function formatWeekRange(weekStart: string): string {
  const days = weekdaysOf(weekStart);
  const monday = parseISODate(days[0]);
  const friday = parseISODate(days[4]);
  return (
    `Mon ${monday.getDate()} ${MONTHS_SHORT[monday.getMonth()]} – ` +
    `Fri ${friday.getDate()} ${MONTHS_SHORT[friday.getMonth()]}`
  );
}
