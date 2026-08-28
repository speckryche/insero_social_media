// How a batch is identified in the UI.
//
// Batches are a plain numbered list: "Batch 12". The week and month batches
// generated before that move still exist, so every helper here falls back to
// their old period rather than rendering blank — history stays readable.
//
// Client-safe: no imports, no Node-only anything.

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Just the identity columns, so this works against any batch row shape.
export interface BatchPeriod {
  batch_number?: number | null;
  week_start_date?: string | null;
  month?: number | null;
  year?: number | null;
}

/** "Batch 12". Legacy rows with no number fall back to their old period. */
export function batchLabel(batch: BatchPeriod): string {
  if (typeof batch.batch_number === "number") {
    return `Batch ${batch.batch_number}`;
  }
  return legacyPeriodLabel(batch) ?? "Untitled batch";
}

/**
 * The old week or month a legacy batch was generated for, or null for a
 * numbered batch. Rendered as a secondary line so old batches stay findable.
 */
export function legacyPeriodLabel(batch: BatchPeriod): string | null {
  if (batch.week_start_date) {
    const monday = parseISO(String(batch.week_start_date));
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    return (
      `Week of ${MONTHS_SHORT[monday.getMonth()]} ${monday.getDate()} – ` +
      `${MONTHS_SHORT[friday.getMonth()]} ${friday.getDate()}`
    );
  }
  if (batch.month && batch.year) {
    return `${MONTHS_LONG[batch.month - 1] ?? ""} ${batch.year}`.trim();
  }
  return null;
}

/** The two lines of the Batches list badge: BATCH / 12. */
export function batchPeriodBadge(batch: BatchPeriod): {
  top: string;
  bottom: string;
} {
  if (typeof batch.batch_number === "number") {
    return { top: "BATCH", bottom: String(batch.batch_number) };
  }
  if (batch.week_start_date) {
    const monday = parseISO(String(batch.week_start_date));
    return {
      top: MONTHS_SHORT[monday.getMonth()] ?? "",
      bottom: String(monday.getDate()),
    };
  }
  if (batch.month && batch.year) {
    return { top: MONTHS_SHORT[batch.month - 1] ?? "", bottom: String(batch.year) };
  }
  return { top: "—", bottom: "" };
}

/**
 * Highest batch number first, with the legacy week/month batches after every
 * numbered one. Array.prototype.sort is stable, so ties keep whatever order
 * the query returned — created_at descending.
 */
export function compareBatchesByPeriodDesc(
  a: BatchPeriod,
  b: BatchPeriod
): number {
  const aNum = typeof a.batch_number === "number" ? a.batch_number : null;
  const bNum = typeof b.batch_number === "number" ? b.batch_number : null;

  if (aNum !== null && bNum !== null) return bNum - aNum;
  if (aNum !== null) return -1;
  if (bNum !== null) return 1;

  // Both legacy: newest week, then newest month.
  const aWeek = a.week_start_date ? String(a.week_start_date) : null;
  const bWeek = b.week_start_date ? String(b.week_start_date) : null;
  if (aWeek && bWeek) return bWeek.localeCompare(aWeek);
  if (aWeek) return -1;
  if (bWeek) return 1;

  return (
    ((b.year ?? 0) * 12 + (b.month ?? 0)) - ((a.year ?? 0) * 12 + (a.month ?? 0))
  );
}

// Local so this file owns its only date need and week.ts could be deleted.
function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
