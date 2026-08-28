// How many posts a batch holds. Lived in week.ts while batches were Mon-Fri
// weeks and the count was a slot budget; batches are a numbered list now, so
// these are just the two sizes the Generate dialog offers.
//
// Client-safe: no imports, no Node-only anything.

export const POST_COUNT_PRESETS = [5, 10];
export const DEFAULT_POST_COUNT = 10;
