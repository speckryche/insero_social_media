// Batch generation internals, extracted from the generate-batch route so the
// add-posts route can reuse the exact same path — same prompts, same banned
// words and Speck-isms, same headline injection, same image assignment.
// Next forbids exporting helpers from a route file, hence this module.

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
  headlinesForCategory,
  type HeadlineItem,
} from "@/lib/headlines";
import { notesForCategory, type RealLifeNote } from "@/lib/notes";
import { CONTENT_SKILL } from "@/lib/content-skill";
import { POST_COUNT_PRESETS, DEFAULT_POST_COUNT } from "@/lib/post-count";

// Re-exported so server-side callers can keep importing the batch shape from
// here alongside everything else they need. Client components must import
// them from "@/lib/post-count" directly — this module pulls in `fs`.
export { POST_COUNT_PRESETS, DEFAULT_POST_COUNT };

// The content skill is the single source of truth for both voices. Batch
// generation appends the JSON contract on top of it; regeneration appends its
// own prose contract instead. See @/lib/content-skill.
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

// A scope is a destination: the company page, Speck's profile, or both. Only
// used now to decide which categories a batch draws from — there is no slot
// contention left to arbitrate.
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
// Nothing caps this any more — a batch is a list, not a week of slots.
export function totalPostsForBatch(postCount: number): number {
  return postCount;
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
  // 1-based index into the notes shown to this category, or null. Its own
  // namespace: note 1 and headline 1 are unrelated.
  note_index?: number | null;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export interface AppSettings {
  weekday_morning_time: string;
  weekday_afternoon_time: string;
  // Nothing reads the weekend pair since scheduling was retired. They stay in
  // app_settings and in the Settings UI for whatever replaces it.
  weekend_morning_time: string;
  weekend_afternoon_time: string;
}

// Posts no longer carry a date or a slot — a batch is a numbered list. The
// two scheduled_time columns are still NOT NULL in the database, so every
// insert stamps them with the weekday defaults from app_settings.
export interface PostTimes {
  scheduled_time_1: string;
  scheduled_time_2: string;
}

export function defaultPostTimes(settings: AppSettings): PostTimes {
  return {
    scheduled_time_1: settings.weekday_morning_time,
    scheduled_time_2: settings.weekday_afternoon_time,
  };
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
  // Unconsumed real-life notes, already capped per scope by the caller.
  notes?: RealLifeNote[];
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
            notes: guidance.notes,
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
    note_index:
      typeof post.note_index === "number" ? post.note_index : null,
  }));
}

// Where a post's material came from, which is also its sort rank. Notes are
// real and perishable, headlines are news, everything else is evergreen — so
// the low post numbers go to the material that goes stale fastest.
export type PostSource = "note" | "headline" | "evergreen";

export function postSource(
  category: ContentCategory,
  post: GeneratedPost,
  notes: RealLifeNote[],
  headlines: HeadlineItem[]
): PostSource {
  if (
    typeof post.note_index === "number" &&
    notesForCategory(category, notes).length > 0
  ) {
    return "note";
  }
  if (
    typeof post.headline_index === "number" &&
    headlinesForCategory(category, headlines).length > 0
  ) {
    return "headline";
  }
  return "evergreen";
}

const SOURCE_RANK: Record<PostSource, number> = {
  note: 0,
  headline: 1,
  evergreen: 2,
};

/**
 * Notes-backed posts first, then headline-backed, then the rest.
 *
 * A stable sort, so the round-robin interleave still decides the order inside
 * each of the three groups and categories stay varied day to day.
 */
export function orderBySource<
  T extends { category: ContentCategory; post: GeneratedPost }
>(items: T[], notes: RealLifeNote[], headlines: HeadlineItem[]): T[] {
  return [...items].sort(
    (a, b) =>
      SOURCE_RANK[postSource(a.category, a.post, notes, headlines)] -
      SOURCE_RANK[postSource(b.category, b.post, notes, headlines)]
  );
}

