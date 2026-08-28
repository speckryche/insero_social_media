# Weekly batches — remaining plan (steps 5–7)

Batches moved from a calendar month to a single Mon–Fri week. This file is the
tracked record of what is done and what is left; the original scratch prompt is
gone.

## The model, as built

- A batch covers one **Mon–Fri week**, identified by `batches.week_start_date`,
  which must be a Monday (`batches_week_start_is_monday`).
- A week offers **10 slots**: five weekdays × morning/afternoon. Weekends are
  never scheduled.
- **Slots are per scope.** The company page and Speck's profile are different
  destinations, so a company post and a personal post can both go out on Monday
  morning. Each scope gets its own 10 slots, so a week can hold 20 posts across
  the two. A `both` batch occupies the company *and* personal lane at once, so
  it competes with everything. `scopeLanes()` / `scopesCompete()` in
  `src/lib/batch-generation.ts` are the single definition of this.
- **Slot contention counts every batch status**, completed included — a post
  that already published on Monday morning still holds Monday morning.
  **The one-batch-per-week-per-scope conflict rule ignores completed batches**,
  because a finished week should not block a new one. These two rules read
  deliberately different sets.
- Legacy monthly batches (`week_start_date IS NULL`) are untouched.
  `buildAllSlots` keeps its weekend branch so existing drafts schedule exactly
  as they always did. `weekend_morning_time` / `weekend_afternoon_time` are
  **legacy-only, not dead**.
- **Headline scans are keyed by week** (`headline_scans.week_start_date`), with
  `month`/`year` still written alongside so pre-week scans keep reading.
- `SLOTS_PER_WEEK`, `POST_COUNT_PRESETS`, `DEFAULT_POST_COUNT` live in
  `src/lib/week.ts`, **not** `batch-generation.ts`, which imports `fs` at module
  load and cannot be pulled into a client bundle. Keep `week.ts` free of
  Node-only imports.

## Done

- **Step 1** — `src/lib/week.ts`: local-time week maths. Never parses
  `YYYY-MM-DD` through `Date`'s string parser (that reads it as UTC and lands a
  day early west of Greenwich); day arithmetic goes through the `Date`
  constructor so it survives DST and month/year rollover.
- **Step 2** — `buildWeekSlots`, 10-slot cap, 5/10 presets, shared
  `loadTakenSlotsForWeek`.
- **Step 3** — generate route takes `weekStart` (defaults to next Monday),
  rejects non-Mondays and started weeks, keys the conflict rule on the week,
  schedules only into free slots, reports slot counts. Adds `GET` for the
  dialog.
- **Step 4** — Generate modal: week picker, 5/10 post counts, live
  "X of 10 slots free" per week and scope, sends `weekStart` + `scope`.

## Step 5 — everywhere else that shows a period

Files: `src/app/batches/page.tsx`, `src/components/batch-review.tsx`,
`src/components/add-posts-dialog.tsx`, `src/app/page.tsx`,
`src/app/ready-to-post/page.tsx`.

- Label batches with `formatWeekRange(week_start_date)` wherever a month label
  is shown today.
- Legacy rows have no `week_start_date` — fall back to the old month/year label
  rather than rendering blank.
- Sort by `week_start_date` descending, legacy rows after.
- Note: a legacy row's `post_count` may be any number (there are real rows at
  12 and 15), so do not assume it is one of `POST_COUNT_PRESETS`.

## Step 6 — make it callable by a scheduler

Do not build a scheduler; just make the endpoint callable without a browser.

- `POST /api/generate-batch` accepts `Authorization: Bearer ${CRON_SECRET}` as
  an alternative to a session, using the same pattern `/api/publish` already
  uses. Session auth keeps working unchanged.
- With no `weekStart` it targets next Monday, so a weekly cron body is just
  `{ "scope": "company", "postCount": 10 }`.
- If a batch already exists for that week and scope, return **200 with
  `skipped: true`**, not an error — a scheduler that fires twice must be
  harmless.
- Add a short section to `CRON_SETUP.md` showing the weekly call alongside the
  existing publish cron.

## Step 7 — verify

1. `npx tsc --noEmit` clean, no dead month/year imports, `npm run build` clean.
2. Generate a 10-post **company** batch for next week against the real
   database: 10 posts, dates Mon–Fri only, two per day, no weekend rows.
3. Generate a 5-post **personal** batch for the **same** week: it fills its own
   lane and does not collide with the company batch, which under the per-scope
   rule means it may legitimately reuse the same times.
4. Confirm an existing legacy monthly batch still renders in the batches list
   without crashing.

## Migrations

- **022** — intentionally unused, reserved for the deferred image-system
  rebuild. See `docs/image-system-notes.md`.
- **023** `023_weekly_batches.sql` — **already applied** to the live database.
- **024** `024_headline_scans_weekly.sql` — **NOT YET APPLIED.** Adds
  `headline_scans.week_start_date`. Headline scanning will fail until it is run.
