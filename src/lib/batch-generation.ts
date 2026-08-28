// Batch generation internals, extracted from the generate-batch route so the
// add-posts route can reuse the exact same path — same prompts, same banned
// words and Speck-isms, same headline injection, same image assignment.
// Next forbids exporting helpers from a route file, hence this module.

import { readFileSync } from "fs";
import { join } from "path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import {
  buildCategoryPrompt,
  parseListSetting,
  ContentCategory,
} from "@/lib/prompts";
import {
  type Platform,
} from "@/lib/platforms";
import {
  stripCodeFences,
  escapeRawControlCharsInStrings,
} from "@/lib/json-repair";
import {
  type HeadlineItem,
} from "@/lib/headlines";
import {
  weekdaysOf,
  SLOTS_PER_WEEK,
  POST_COUNT_PRESETS,
  DEFAULT_POST_COUNT,
} from "@/lib/week";

// Re-exported so server-side callers can keep importing the batch shape from
// here alongside everything else they need. Client components must import
// them from "@/lib/week" directly — this module pulls in `fs`.
export { SLOTS_PER_WEEK, POST_COUNT_PRESETS, DEFAULT_POST_COUNT };

// Read content skill file as the single source of truth for post generation
const CONTENT_SKILL = readFileSync(
  join(process.cwd(), "src/lib/Insero_Content_Skill.md"),
  "utf-8"
);

export const SYSTEM_PROMPT = `${CONTENT_SKILL}

You must respond with valid JSON only. No markdown, no code fences, no extra text.`;

// Use service role for server-side operations
export function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const CATEGORIES: ContentCategory[] = [
  "ai_speak",
  "tech_speak",
  "quote_speak",
  "cost_speak",
  "pots_speak",
  "personal_take",
];

// Share of every batch by category, per the content plan. Sums to 1.0.
export const CATEGORY_MIX: Record<ContentCategory, number> = {
  ai_speak: 0.27,
  tech_speak: 0.13,
  quote_speak: 0.13,
  cost_speak: 0.13,
  pots_speak: 0.10,
  personal_take: 0.23,
};

// Which categories a batch scope covers.
export type BatchScope = "both" | "company" | "personal";

export const COMPANY_CATEGORIES: ContentCategory[] = [
  "ai_speak",
  "tech_speak",
  "quote_speak",
  "cost_speak",
  "pots_speak",
];

// Slots are per scope, not per week. The company page and Speck's profile are
// different destinations, so a company post and a personal post can both go
// out on Monday morning without clashing — each scope gets its own
// SLOTS_PER_WEEK. A "both" batch covers both destinations, so it occupies a
// slot in each lane at once.
export type ScopeLane = "company" | "personal";

export function scopeLanes(scope: BatchScope | null): ScopeLane[] {
  // A NULL scope predates the column and covered everything.
  if (scope === "company") return ["company"];
  if (scope === "personal") return ["personal"];
  return ["company", "personal"];
}

// Whether two batches would be reaching for the same slots.
export function scopesCompete(
  a: BatchScope | null,
  b: BatchScope | null
): boolean {
  const lanesOfB = new Set(scopeLanes(b));
  return scopeLanes(a).some((lane) => lanesOfB.has(lane));
}

export function categoriesForScope(scope: BatchScope): ContentCategory[] {
  if (scope === "company") return COMPANY_CATEGORIES;
  if (scope === "personal") return ["personal_take"];
  return CATEGORIES;
}

// The chosen size is the exact number of posts for whatever scope is picked:
// "Personal only" at 10 means 10 personal posts, not 10 * the personal share.
// The scope decides which categories are in play; allocateByMix then splits
// the full count across just those, renormalizing their proportions.
//
// The week is the ceiling — it has only SLOTS_PER_WEEK slots to give.
export function totalPostsForBatch(postCount: number): number {
  return Math.min(postCount, SLOTS_PER_WEEK);
}

// Largest-remainder apportionment, so the per-category counts always sum to
// exactly totalPosts no matter how many days the month has. Weights are
// renormalized over the included categories, which keeps the relative
// CATEGORY_MIX proportions intact when a scope excludes some of them.
export function allocateByMix(
  totalPosts: number,
  categories: ContentCategory[] = CATEGORIES
): Map<ContentCategory, number> {
  const weightSum = categories.reduce(
    (sum, category) => sum + CATEGORY_MIX[category],
    0
  );

  const exact = categories.map((category) => ({
    category,
    value: (totalPosts * CATEGORY_MIX[category]) / weightSum,
  }));

  const counts = new Map<ContentCategory, number>(
    exact.map((e) => [e.category, Math.floor(e.value)])
  );

  let assigned = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  const byRemainder = [...exact].sort(
    (a, b) => (b.value - Math.floor(b.value)) - (a.value - Math.floor(a.value))
  );

  let i = 0;
  while (assigned < totalPosts) {
    const { category } = byRemainder[i % byRemainder.length];
    counts.set(category, counts.get(category)! + 1);
    assigned++;
    i++;
  }

  return counts;
}

export interface GeneratedPost {
  linkedin_content: string;
  linkedin_personal_content: string;
  x_content: string;
  facebook_content: string;
  google_content: string;
  // 1-based index into the headlines shown to this category, or null.
  headline_index?: number | null;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export interface AppSettings {
  weekday_morning_time: string;
  weekday_afternoon_time: string;
  // Weekly batches are Mon-Fri, so these two are never read when building a
  // week. They still drive the legacy month path in buildAllSlots below,
  // which is why they stay in app_settings and in the Settings UI.
  weekend_morning_time: string;
  weekend_afternoon_time: string;
}

export interface ScheduleSlot {
  scheduled_date: string;
  time_slot: "morning" | "afternoon";
  scheduled_time_1: string;
  scheduled_time_2: string;
}

// Every slot a Mon-Fri week offers — morning and afternoon on each weekday,
// in date then morning/afternoon order. Ten in total.
//
// There is deliberately no weekend branch: weekends are simply not generated,
// so weekend_morning_time / weekend_afternoon_time never apply here.
export function buildWeekSlots(
  weekStart: string,
  settings: AppSettings
): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];

  for (const dateStr of weekdaysOf(weekStart)) {
    for (const timeSlot of ["morning", "afternoon"] as const) {
      slots.push({
        scheduled_date: dateStr,
        time_slot: timeSlot,
        scheduled_time_1: settings.weekday_morning_time,
        scheduled_time_2: settings.weekday_afternoon_time,
      });
    }
  }

  return slots;
}

// Legacy: every slot a calendar month offers, weekends included. Kept for the
// monthly batches created before the weekly move — they carry month/year and
// no week_start_date, and add-posts still has to schedule into them. Its
// weekend branch stays so those batches keep behaving exactly as they did.
// Anything new goes through buildWeekSlots.
export function buildAllSlots(
  month: number,
  year: number,
  settings: AppSettings
): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekend = isWeekend(date);

    const morningTime = weekend
      ? settings.weekend_morning_time
      : settings.weekday_morning_time;
    const afternoonTime = weekend
      ? settings.weekend_afternoon_time
      : settings.weekday_afternoon_time;

    slots.push({
      scheduled_date: dateStr,
      time_slot: "morning",
      scheduled_time_1: morningTime,
      scheduled_time_2: afternoonTime,
    });
    slots.push({
      scheduled_date: dateStr,
      time_slot: "afternoon",
      scheduled_time_1: morningTime,
      scheduled_time_2: afternoonTime,
    });
  }

  return slots;
}

// Picks `wanted` slots at an even stride across the list, rather than taking
// the first N — front-loading would cram a short batch into the first half of
// the month.
export function selectEvenly<T>(slots: T[], wanted: number): T[] {
  const take = Math.min(wanted, slots.length);
  const picked: T[] = [];
  for (let i = 0; i < take; i++) {
    picked.push(slots[Math.floor((i * slots.length) / take)]);
  }
  return picked;
}

// A slot's identity, for working out which are already taken.
export function slotKey(slot: {
  scheduled_date: string;
  time_slot: string;
}): string {
  return `${slot.scheduled_date}|${slot.time_slot}`;
}

// Which of a week's slots are already spoken for, for one scope.
//
// Each scope has its own SLOTS_PER_WEEK, so only batches sharing a lane with
// `scope` can take its slots: a personal batch never blocks a company slot,
// but a "both" batch blocks both. The generate route and the add-posts route
// read contention through this one function, so the two paths cannot disagree
// about what is taken.
//
// Every batch in the week counts whatever its status — a completed batch's
// posts still occupy the slot they went out in.
export async function loadTakenSlotsForWeek(
  supabase: ReturnType<typeof getSupabase>,
  weekStart: string,
  scope: BatchScope
): Promise<Set<string>> {
  const { data: weekBatches } = await supabase
    .from("batches")
    .select("id, scope")
    .eq("week_start_date", weekStart);

  const batchIds = (weekBatches || [])
    .filter((b) => scopesCompete((b.scope as BatchScope) ?? null, scope))
    .map((b) => String(b.id));
  if (batchIds.length === 0) return new Set();

  const { data: posts } = await supabase
    .from("posts")
    .select("scheduled_date, time_slot")
    .in("batch_id", batchIds);

  return new Set(
    (posts || []).map((post) =>
      slotKey({
        scheduled_date: String(post.scheduled_date),
        time_slot: String(post.time_slot),
      })
    )
  );
}

// Every slot key a week has, in order. Slot identity is date + time slot, so
// this needs no settings — the times only decorate the row.
export function weekSlotKeys(weekStart: string): string[] {
  return weekdaysOf(weekStart).flatMap((date) =>
    (["morning", "afternoon"] as const).map((timeSlot) =>
      slotKey({ scheduled_date: date, time_slot: timeSlot })
    )
  );
}

// How many of a week's slots nothing has claimed yet.
export function countFreeSlots(weekStart: string, taken: Set<string>): number {
  return weekSlotKeys(weekStart).filter((key) => !taken.has(key)).length;
}

// The one way a batch gets scheduled. Slots already taken by other batches in
// the week are dropped before selecting, so a company batch and a personal
// batch in the same week can never be handed the same slot. Passing no
// `takenSlots` schedules into an empty week.
export function buildSchedule(
  weekStart: string,
  settings: AppSettings,
  maxPosts: number = SLOTS_PER_WEEK,
  takenSlots: Set<string> = new Set()
): Array<ScheduleSlot & { post_number: number }> {
  const free = buildWeekSlots(weekStart, settings).filter(
    (slot) => !takenSlots.has(slotKey(slot))
  );
  return selectEvenly(free, maxPosts).map((slot, i) => ({
    ...slot,
    post_number: i + 1,
  }));
}

export function interleaveCategories(
  postsByCategory: Map<ContentCategory, GeneratedPost[]>
): Array<{ category: ContentCategory; post: GeneratedPost; indexInCategory: number }> {
  const result: Array<{
    category: ContentCategory;
    post: GeneratedPost;
    indexInCategory: number;
  }> = [];

  // Interleave: cycle through categories so content is varied day to day
  const maxPerCategory = Math.max(...Array.from(postsByCategory.values()).map(p => p.length));
  for (let i = 0; i < maxPerCategory; i++) {
    for (const category of CATEGORIES) {
      const posts = postsByCategory.get(category);
      if (posts && posts[i]) {
        result.push({ category, post: posts[i], indexInCategory: i });
      }
    }
  }

  return result;
}



// The editable lists from app_settings, plus the free-text notes. All three
// are stored as plain text and read at generation time.
export interface GenerationGuidance {
  contentNotes?: string;
  bannedWords?: string;
  speckIsms?: string;
  styleSamples?: string;
  enabledPlatforms?: Platform[];
  headlines?: HeadlineItem[];
}

export async function generateCategoryPosts(
  anthropic: Anthropic,
  category: ContentCategory,
  postCount: number = 12,
  guidance: GenerationGuidance = {}
): Promise<GeneratedPost[]> {
  let systemPrompt = SYSTEM_PROMPT;

  // Banned words apply to every category, so they ride the system prompt.
  const bannedWords = parseListSetting(guidance.bannedWords);
  if (bannedWords.length > 0) {
    systemPrompt += `\n\nNever use any of these words or phrases: ${bannedWords.join(", ")}.`;
  } else {
    // Nothing to inject means either an empty Settings list or a missing
    // app_settings.banned_words column. Say so rather than fail silently —
    // a silent no-op here looks identical to the model ignoring the rule.
    console.warn(
      `[generate-batch] no banned words injected for ${category} — the list is empty or app_settings.banned_words is missing`
    );
  }

  if (guidance.contentNotes) {
    systemPrompt += `\n\nADDITIONAL GUIDANCE FROM THE USER:\n${guidance.contentNotes}`;
  }

  // Test-mode batches ask for 2 posts per category; full batches ask for many
  // more. The ceiling has to cover thinking tokens as well as the JSON —
  // Sonnet 5 thinks by default, and on a 2-post category that reasoning alone
  // ran to ~2800 tokens, over half the old 8000 budget.
  const maxTokens = postCount <= 3 ? 16000 : 32000;

  // Streamed so the larger ceiling can't trip the SDK's HTTP timeout on a
  // long full-batch response. finalMessage() gives back the same Message
  // shape messages.create() returned, so stop_reason and content still apply.
  const message = await anthropic.messages
    .stream({
      model: "claude-sonnet-5",
      max_tokens: maxTokens,
      // Thinking stays on — disabling it on Sonnet 5 risks leaked reasoning
      // tags — but low effort keeps it from eating the output budget on what
      // is really just JSON assembly from an explicit spec. personal_take is
      // the exception: hitting Voice B's register takes more room to think.
      output_config: {
        effort: category === "personal_take" ? "medium" : "low",
      },
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: buildCategoryPrompt(category, postCount, {
            speckIsms: guidance.speckIsms,
            styleSamples: guidance.styleSamples,
            enabledPlatforms: guidance.enabledPlatforms,
            headlines: guidance.headlines,
          }),
        },
      ],
    })
    .finalMessage();

  // A truncated response yields invalid JSON. Say that plainly rather than
  // letting it surface as an opaque parse error.
  if (message.stop_reason === "max_tokens") {
    throw new Error(
      `Response for ${category} was cut off at the ${maxTokens} token limit (stop_reason: max_tokens) while generating ${postCount} posts. The JSON is incomplete — retry with fewer posts per category or a higher max_tokens.`
    );
  }

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`No text response for category: ${category}`);
  }

  const jsonText = escapeRawControlCharsInStrings(
    stripCodeFences(textBlock.text)
  );

  let posts: GeneratedPost[];
  try {
    posts = JSON.parse(jsonText);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not parse the JSON response for ${category} (${reason}). stop_reason was "${message.stop_reason}".`
    );
  }

  if (!Array.isArray(posts) || posts.length === 0) {
    throw new Error(
      `Expected posts for ${category}, got ${Array.isArray(posts) ? "empty array" : "non-array"}`
    );
  }

  // Banned words are an instruction, not a guarantee. Check what actually came
  // back and name anything that slipped through, so a leak shows up in the
  // logs instead of only in the finished batch.
  if (bannedWords.length > 0) {
    const CONTENT_FIELDS = [
      "linkedin_content",
      "linkedin_personal_content",
      "x_content",
      "facebook_content",
      "google_content",
    ] as const;

    posts.forEach((post, i) => {
      for (const field of CONTENT_FIELDS) {
        const text = (post as unknown as Record<string, unknown>)[field];
        if (typeof text !== "string" || !text) continue;

        for (const word of bannedWords) {
          // Word-boundary match so "delve" doesn't fire on "delved into" —
          // it should — but "AI" doesn't fire inside "said".
          const pattern = new RegExp(
            `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
            "i"
          );
          if (pattern.test(text)) {
            console.warn(
              `[generate-batch] BANNED WORD "${word}" in ${category} post ${i + 1} (${field})`
            );
          }
        }
      }
    });
  }

  // A disabled platform's field was never asked for, so it won't come back.
  // Normalize every content field to a string so nothing downstream has to
  // care which platforms were switched on when the batch was generated.
  return posts.map((post) => ({
    ...post,
    linkedin_content: post.linkedin_content ?? "",
    linkedin_personal_content: post.linkedin_personal_content ?? "",
    x_content: post.x_content ?? "",
    facebook_content: post.facebook_content ?? "",
    google_content: post.google_content ?? "",
    headline_index:
      typeof post.headline_index === "number" ? post.headline_index : null,
  }));
}

