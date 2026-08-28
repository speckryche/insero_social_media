// Scheduled vs published.
//
// Posts are queued in LinkedIn's own scheduler, so "marked as posted" can
// carry a future date. Rather than a cron flipping rows the moment that date
// arrives, the distinction is derived from published_at every time it is read:
// a post whose date has passed reads as published, one whose date is still
// ahead reads as scheduled. status is written to match at mark time, and this
// keeps telling the truth afterwards without anything having to run.
//
// Client-safe: no imports, no Node-only anything.

/** Today at 00:00 local, the cutoff "past or today" is measured against. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** True when `publishedAt` is a real date later than today. */
export function isFutureDate(publishedAt: string | null | undefined): boolean {
  if (!publishedAt) return false;
  const when = new Date(publishedAt);
  if (Number.isNaN(when.getTime())) return false;
  const day = new Date(when.getFullYear(), when.getMonth(), when.getDate());
  return day.getTime() > startOfToday().getTime();
}

/**
 * Whether a post counts as live yet. A post marked for a future date is not
 * published — it is waiting in LinkedIn's queue — so it stays out of published
 * counts until its day arrives.
 */
export function isLivePublished(post: {
  status?: string | null;
  published_at?: string | null;
}): boolean {
  if (post.status !== "published" && post.status !== "scheduled") return false;
  return !isFutureDate(post.published_at);
}

/** "Posted" once the date has arrived, "Scheduled" while it is still ahead. */
export function postedLabel(publishedAt: string | null | undefined): string {
  return isFutureDate(publishedAt) ? "Scheduled" : "Posted";
}

/** " · Sep 2" — the day it goes out, when we know it. */
export function postedOnLabel(publishedAt: string | null | undefined): string {
  if (!publishedAt) return "";
  const when = new Date(publishedAt);
  if (Number.isNaN(when.getTime())) return "";
  return ` · ${when.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

/** Midday local on a YYYY-MM-DD, so the stored instant can't slip a day. */
export function isoDateToTimestamp(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0).toISOString();
}
