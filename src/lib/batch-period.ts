// Presentation for a batch's period, shared by the Batches list, the batch
// header, the dashboard and Ready to Post so they can't drift apart — the same
// reason batch-scope.ts exists.
//
// Batches are Mon-Fri weeks now, identified by week_start_date. The monthly
// batches generated before that move have month/year and no week, and they are
// still live in the database, so every label here falls back rather than
// rendering blank.
//
// Client-safe: this imports only from week.ts, which has no Node-only imports.

import { formatWeekRange, parseISODate } from "@/lib/week";

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Just the period columns, so this works against any batch row shape.
export interface BatchPeriod {
  week_start_date?: string | null;
  month?: number | null;
  year?: number | null;
}

export function isWeeklyBatch(batch: BatchPeriod): boolean {
  return !!batch.week_start_date;
}

/** "Mon 31 Aug – Fri 4 Sep", or "September 2026" for a legacy monthly batch. */
export function batchPeriodLabel(batch: BatchPeriod): string {
  if (batch.week_start_date) {
    return formatWeekRange(String(batch.week_start_date));
  }
  if (batch.month && batch.year) {
    return `${MONTHS_LONG[batch.month - 1] ?? ""} ${batch.year}`.trim();
  }
  return "Undated batch";
}

/**
 * The two lines of the Batches list date badge. A weekly batch shows the
 * Monday it starts on (AUG / 31); a legacy monthly batch keeps its old month
 * and year (SEP / 2026).
 */
export function batchPeriodBadge(batch: BatchPeriod): {
  top: string;
  bottom: string;
} {
  if (batch.week_start_date) {
    const monday = parseISODate(String(batch.week_start_date));
    return {
      top: MONTHS_SHORT[monday.getMonth()] ?? "",
      bottom: String(monday.getDate()),
    };
  }
  if (batch.month && batch.year) {
    return {
      top: MONTHS_SHORT[batch.month - 1] ?? "",
      bottom: String(batch.year),
    };
  }
  return { top: "—", bottom: "" };
}

/**
 * Newest period first, with the legacy monthly batches after every weekly one.
 * Array.prototype.sort is stable, so rows that tie here keep whatever order
 * the query returned them in — created_at descending.
 */
export function compareBatchesByPeriodDesc(
  a: BatchPeriod,
  b: BatchPeriod
): number {
  const aWeek = a.week_start_date ? String(a.week_start_date) : null;
  const bWeek = b.week_start_date ? String(b.week_start_date) : null;

  if (aWeek && bWeek) return bWeek.localeCompare(aWeek);
  if (aWeek) return -1;
  if (bWeek) return 1;

  // Both legacy: newest month first.
  return (
    ((b.year ?? 0) * 12 + (b.month ?? 0)) -
    ((a.year ?? 0) * 12 + (a.month ?? 0))
  );
}
