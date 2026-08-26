import { NextRequest, NextResponse } from "next/server";
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
  parseEnabledPlatforms,
  type Platform,
} from "@/lib/platforms";
import {
  stripCodeFences,
  escapeRawControlCharsInStrings,
} from "@/lib/json-repair";
import {
  headlinesForCategory,
  isHeadlineItem,
  type HeadlineItem,
} from "@/lib/headlines";

// Read content skill file as the single source of truth for post generation
const CONTENT_SKILL = readFileSync(
  join(process.cwd(), "src/lib/Insero_Content_Skill.md"),
  "utf-8"
);

const SYSTEM_PROMPT = `${CONTENT_SKILL}

You must respond with valid JSON only. No markdown, no code fences, no extra text.`;

// Use service role for server-side operations
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const CATEGORIES: ContentCategory[] = [
  "ai_speak",
  "tech_speak",
  "quote_speak",
  "cost_speak",
  "humor_speak",
  "personal_take",
];

// Share of every batch by category, per the content plan. Sums to 1.0.
const CATEGORY_MIX: Record<ContentCategory, number> = {
  ai_speak: 0.30,
  tech_speak: 0.13,
  quote_speak: 0.13,
  cost_speak: 0.13,
  humor_speak: 0.08,
  personal_take: 0.23,
};

// Which categories a batch scope covers.
type BatchScope = "both" | "company" | "personal";

const COMPANY_CATEGORIES: ContentCategory[] = [
  "ai_speak",
  "tech_speak",
  "quote_speak",
  "cost_speak",
  "humor_speak",
];

function categoriesForScope(scope: BatchScope): ContentCategory[] {
  if (scope === "company") return COMPANY_CATEGORIES;
  if (scope === "personal") return ["personal_take"];
  return CATEGORIES;
}

// Batch sizes offered in the Generate dialog.
const POST_COUNT_PRESETS = [10, 20, 30, 40, 50, 60];
const DEFAULT_POST_COUNT = 30;

// The chosen size is the exact number of posts for whatever scope is picked:
// "Personal only" at 30 means 30 personal posts, not 30 * the personal share.
// The scope decides which categories are in play; allocateByMix then splits
// the full count across just those, renormalizing their proportions.
//
// The only thing that can shorten a batch is the calendar — a 28-day month
// offers 56 slots, so a 60-post batch there becomes 56.
function totalPostsForBatch(daysInMonth: number, postCount: number): number {
  return Math.min(postCount, daysInMonth * 2);
}

// Largest-remainder apportionment, so the per-category counts always sum to
// exactly totalPosts no matter how many days the month has. Weights are
// renormalized over the included categories, which keeps the relative
// CATEGORY_MIX proportions intact when a scope excludes some of them.
function allocateByMix(
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

type ImageTemplateType =
  | "stat_card"
  | "quote_card"
  | "tip_graphic"
  | "comparison"
  | "savings_highlight"
  | "myth_buster"
  | "did_you_know"
  | "checklist"
  | "photo_landscape"
  | "photo_tip"
  | "photo_stat"
  | "photo_quote"
  | "photo_overlay_right"
  | "photo_overlay_left";

interface GeneratedPost {
  linkedin_content: string;
  linkedin_personal_content: string;
  x_content: string;
  facebook_content: string;
  google_content: string;
  image_headline?: string;
  image_body?: string;
  image_stat_number?: string;
  image_stat_label?: string;
  // 1-based index into the headlines shown to this category, or null.
  headline_index?: number | null;
}

function assignImageTemplate(
  category: ContentCategory,
  indexInCategory: number
): { has_image: boolean; image_template_type: ImageTemplateType | null } {
  // Base canvas template per category, before photo templates are mixed in.
  let base: { has_image: boolean; image_template_type: ImageTemplateType | null };
  switch (category) {
    case "ai_speak":
      // The priority category — most posts carry an image.
      base = {
        has_image: true,
        image_template_type: indexInCategory % 2 === 0 ? "tip_graphic" : "checklist",
      };
      break;
    case "tech_speak":
      base = indexInCategory % 2 === 1
        ? {
            has_image: true,
            image_template_type: indexInCategory % 4 === 1 ? "tip_graphic" : "checklist",
          }
        : { has_image: false, image_template_type: null };
      break;
    case "quote_speak":
      base = indexInCategory % 2 === 0
        ? {
            has_image: true,
            image_template_type: indexInCategory % 4 === 0 ? "quote_card" : "savings_highlight",
          }
        : { has_image: false, image_template_type: null };
      break;
    case "cost_speak":
      // No dollar figures allowed in this category, so the stat templates are
      // deliberately not used — comparisons and checklists carry the idea.
      base = indexInCategory % 2 === 0
        ? {
            has_image: true,
            image_template_type: indexInCategory % 4 === 0 ? "comparison" : "checklist",
          }
        : { has_image: false, image_template_type: null };
      break;
    case "humor_speak":
      base = {
        has_image: true,
        image_template_type: indexInCategory % 2 === 0 ? "quote_card" : "tip_graphic",
      };
      break;
    case "personal_take":
      base = { has_image: false, image_template_type: null };
      break;
    default:
      base = { has_image: false, image_template_type: null };
  }

  // Photo template injection — give the feed a natural mix of overlay,
  // photo, and graphic templates. Distribution per category from the brand
  // brief. photo_overlay_* templates dominate eligible categories now.
  const rand = Math.random();

  if (category === "quote_speak" || category === "personal_take") {
    // 40% overlay_right, 20% overlay_left, 20% photo_landscape, 20% base
    if (rand < 0.40) return { has_image: true, image_template_type: "photo_overlay_right" };
    if (rand < 0.60) return { has_image: true, image_template_type: "photo_overlay_left" };
    if (rand < 0.80) return { has_image: true, image_template_type: "photo_landscape" };
    return base;
  }

  if (category === "tech_speak") {
    // 35% overlay_right, 15% overlay_left, 25% photo_tip, 25% tip_graphic
    if (rand < 0.35) return { has_image: true, image_template_type: "photo_overlay_right" };
    if (rand < 0.50) return { has_image: true, image_template_type: "photo_overlay_left" };
    if (rand < 0.75) return { has_image: true, image_template_type: "photo_tip" };
    return { has_image: true, image_template_type: "tip_graphic" };
  }

  if (category === "ai_speak") {
    // 35% overlay_right, 15% overlay_left, 25% photo_tip, 25% existing canvas.
    // The priority category leans on photo templates so the feed doesn't turn
    // into a wall of graphics.
    if (rand < 0.35) return { has_image: true, image_template_type: "photo_overlay_right" };
    if (rand < 0.50) return { has_image: true, image_template_type: "photo_overlay_left" };
    if (rand < 0.75) return { has_image: true, image_template_type: "photo_tip" };
    return base;
  }

  if (category === "cost_speak") {
    // 35% overlay_right, 15% overlay_left, 25% checklist, 25% comparison —
    // value questions read best as lists and before/after pairs. No stat
    // templates: this category may not use numbers.
    if (rand < 0.35) return { has_image: true, image_template_type: "photo_overlay_right" };
    if (rand < 0.50) return { has_image: true, image_template_type: "photo_overlay_left" };
    if (rand < 0.75) return { has_image: true, image_template_type: "checklist" };
    return { has_image: true, image_template_type: "comparison" };
  }

  if (category === "humor_speak") {
    // A joke lands better on a photo or a quote card than on a chart.
    if (rand < 0.35) return { has_image: true, image_template_type: "photo_overlay_right" };
    if (rand < 0.55) return { has_image: true, image_template_type: "photo_landscape" };
    return base;
  }

  // Any other category falls through to the base rule.
  return base;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

interface AppSettings {
  weekday_morning_time: string;
  weekday_afternoon_time: string;
  weekend_morning_time: string;
  weekend_afternoon_time: string;
}

function buildSchedule(
  month: number,
  year: number,
  settings: AppSettings,
  maxPosts: number = 60
): Array<{
  scheduled_date: string;
  time_slot: "morning" | "afternoon";
  scheduled_time_1: string;
  scheduled_time_2: string;
  post_number: number;
}> {
  const schedule: Array<{
    scheduled_date: string;
    time_slot: "morning" | "afternoon";
    scheduled_time_1: string;
    scheduled_time_2: string;
    post_number: number;
  }> = [];

  const daysInMonth = new Date(year, month, 0).getDate();

  // Every slot the month offers — morning and afternoon on every day.
  const allSlots: Array<Omit<(typeof schedule)[number], "post_number">> = [];

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

    allSlots.push({
      scheduled_date: dateStr,
      time_slot: "morning",
      scheduled_time_1: morningTime,
      scheduled_time_2: afternoonTime,
    });
    allSlots.push({
      scheduled_date: dateStr,
      time_slot: "afternoon",
      scheduled_time_1: morningTime,
      scheduled_time_2: afternoonTime,
    });
  }

  const wanted = Math.min(maxPosts, allSlots.length);

  // Pick slots at an even stride instead of taking the first N. Front-loading
  // would cram a 30-post batch into the first half of the month.
  for (let i = 0; i < wanted; i++) {
    const slotIndex = Math.floor((i * allSlots.length) / wanted);
    schedule.push({ ...allSlots[slotIndex], post_number: i + 1 });
  }

  return schedule;
}

function interleaveCategories(
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
interface GenerationGuidance {
  contentNotes?: string;
  bannedWords?: string;
  speckIsms?: string;
  styleSamples?: string;
  enabledPlatforms?: Platform[];
  headlines?: HeadlineItem[];
}

async function generateCategoryPosts(
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
      // is really just JSON assembly from an explicit spec. personal_take and
      // humor_speak are the exceptions: hitting Voice B's register, and
      // landing an actual joke, both take more room to think.
      output_config: {
        effort:
          category === "personal_take" || category === "humor_speak"
            ? "medium"
            : "low",
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

async function generateImagesForPost(
  postId: string,
  imageTemplateType: string,
  imageData: {
    headline: string;
    bodyText: string;
    statNumber?: string;
    statLabel?: string;
    category?: string;
  },
  baseUrl: string
) {
  const platforms = ["linkedin", "x", "facebook", "google", "linkedin_personal"];

  for (const platform of platforms) {
    try {
      await fetch(`${baseUrl}/api/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          templateType: imageTemplateType,
          headline: imageData.headline,
          bodyText: imageData.bodyText,
          statNumber: imageData.statNumber,
          statLabel: imageData.statLabel,
          category: imageData.category,
          platform,
        }),
      });
    } catch (err) {
      console.error(`Image generation failed for post ${postId}, platform ${platform}:`, err);
    }
  }
}

export async function POST(request: NextRequest) {
  let batch: { id: string } | null = null;
  try {
    const {
      month,
      year,
      testMode,
      includeImages = true,
      scope: rawScope = "both",
      postCount: rawPostCount = DEFAULT_POST_COUNT,
      scanId,
      headlineIds,
    } = await request.json();

    if (!month || !year || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Invalid month or year" },
        { status: 400 }
      );
    }

    if (!["both", "company", "personal"].includes(rawScope)) {
      return NextResponse.json(
        { error: `Invalid scope: ${rawScope}` },
        { status: 400 }
      );
    }
    const scope = rawScope as BatchScope;

    const postCount = Number(rawPostCount);
    if (!POST_COUNT_PRESETS.includes(postCount)) {
      return NextResponse.json(
        {
          error: `Invalid postCount: ${rawPostCount}. Expected one of ${POST_COUNT_PRESETS.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    // Scope picks the categories; test mode then takes 2 from each of them.
    const categoriesToGenerate: ContentCategory[] = categoriesForScope(scope);

    const supabase = getSupabase();
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    // One live batch per month per scope. A "both" batch occupies the company
    // and personal halves at once, so it conflicts with anything; company-only
    // and personal-only batches can coexist for the same month. They publish
    // to different LinkedIn destinations, so sharing time slots is fine.
    const { data: existingBatches } = await supabase
      .from("batches")
      .select("id, status, scope")
      .eq("month", month)
      .eq("year", year)
      .neq("status", "completed");

    const conflicting = (existingBatches || []).find((batch) => {
      // A NULL scope predates the column and covered everything.
      const existingScope = (batch.scope as BatchScope) || "both";
      return (
        existingScope === "both" || scope === "both" || existingScope === scope
      );
    });

    if (conflicting) {
      const existingScope = (conflicting.scope as BatchScope) || "both";
      const describe = (value: BatchScope) =>
        value === "both"
          ? "Company + Personal"
          : value === "company"
          ? "Company only"
          : "Personal only";

      const reason =
        existingScope === scope
          ? `A ${describe(scope)} batch already exists for this month (status: ${conflicting.status}).`
          : `A ${describe(existingScope)} batch already exists for this month (status: ${conflicting.status}), and it overlaps a ${describe(scope)} batch.`;

      const suggestion =
        existingScope === "both" || scope === "both"
          ? " Delete it, choose a different month, or generate the two halves separately as Company only and Personal only."
          : " Delete it or choose a different month.";

      return NextResponse.json(
        { error: reason + suggestion },
        { status: 409 }
      );
    }

    // 1. Create the batch record
    const daysInMonth = new Date(year, month, 0).getDate();
    const totalPosts = testMode
      ? categoriesToGenerate.length * 2
      : totalPostsForBatch(daysInMonth, postCount);

    const { data: batchData, error: batchError } = await supabase
      .from("batches")
      .insert({
        month,
        year,
        status: "draft",
        total_posts: totalPosts,
        scope,
        // The size chosen in the dialog. Test batches have no chosen size, so
        // they record what they actually produced.
        post_count: testMode ? totalPosts : postCount,
      })
      .select()
      .single();

    if (batchError || !batchData) {
      console.error("Batch creation error:", batchError);
      return NextResponse.json(
        { error: "Failed to create batch" },
        { status: 500 }
      );
    }
    batch = batchData;

    // 2. Fetch app_settings for scheduling
    const { data: settings, error: settingsError } = await supabase
      .from("app_settings")
      .select("*")
      .single();

    if (settingsError || !settings) {
      console.error("Settings fetch error:", settingsError);
      return NextResponse.json(
        { error: "Failed to fetch app settings" },
        { status: 500 }
      );
    }

    // 3. Generate posts — one category at a time
    // Picked headlines, if the user ran a scan. Falls back to the latest scan
    // for this month when the dialog sent ids but no scan id.
    let pickedHeadlines: HeadlineItem[] = [];
    if (Array.isArray(headlineIds) && headlineIds.length > 0) {
      let scanQuery = supabase.from("headline_scans").select("id, items");
      scanQuery = scanId
        ? scanQuery.eq("id", scanId)
        : scanQuery
            .eq("month", month)
            .eq("year", year)
            .order("created_at", { ascending: false })
            .limit(1);

      const { data: scans } = await scanQuery;
      const items = ((scans?.[0]?.items as HeadlineItem[]) || []).filter(
        isHeadlineItem
      );
      pickedHeadlines = items.filter((item) => headlineIds.includes(item.id));
      console.log(
        `[generate-batch] using ${pickedHeadlines.length} picked headlines`
      );
    }

    const enabledPlatforms = parseEnabledPlatforms(settings.enabled_platforms);
    const guidance: GenerationGuidance = {
      contentNotes: settings.content_notes || "",
      bannedWords: settings.banned_words || "",
      speckIsms: settings.speck_isms || "",
      styleSamples: settings.style_samples || "",
      headlines: pickedHeadlines,
      enabledPlatforms,
    };
    console.log(
      `[generate-batch] enabled platforms: ${enabledPlatforms.join(", ")}`
    );
    console.log(
      `[generate-batch] banned words loaded: ${parseListSetting(settings.banned_words).length}` +
        (settings.banned_words === undefined
          ? " (app_settings.banned_words column is MISSING — run migration 014)"
          : "")
    );
    const postsByCategory = new Map<ContentCategory, GeneratedPost[]>();

    // Per-category counts: flat 2 each in test mode, otherwise apportioned
    // across the month by CATEGORY_MIX.
    const categoryCounts = testMode
      ? new Map<ContentCategory, number>(categoriesToGenerate.map((c) => [c, 2]))
      : allocateByMix(totalPosts, categoriesToGenerate);

    for (const category of categoriesToGenerate) {
      const count = categoryCounts.get(category) ?? 0;
      if (count === 0) continue;
      const posts = await generateCategoryPosts(anthropic, category, count, guidance);
      postsByCategory.set(category, posts);
    }

    // 4. Interleave categories for varied daily content
    const interleaved = interleaveCategories(postsByCategory);

    // 5. Build schedule
    const schedule = buildSchedule(month, year, settings, totalPosts);

    // 6. Trim posts to fit available schedule slots (shorter months have fewer
    //    days). Posts that reference a headline go first — news gets stale, so
    //    it takes the earliest slots in the month. Order is otherwise the
    //    interleave order, which keeps categories varied within each group.
    const usesHeadline = (item: (typeof interleaved)[number]) =>
      headlinesForCategory(item.category, pickedHeadlines).length > 0 &&
      typeof item.post.headline_index === "number";

    const ordered = [
      ...interleaved.filter(usesHeadline),
      ...interleaved.filter((item) => !usesHeadline(item)),
    ];
    const postsToSchedule = ordered.slice(0, schedule.length);

    // Test mode template assignments: map category + index-in-category to a specific template
    const TEST_MODE_TEMPLATES: Record<string, ImageTemplateType[]> = {
      ai_speak: ["tip_graphic", "photo_tip"],
      tech_speak: ["checklist", "photo_overlay_right"],
      quote_speak: ["savings_highlight", "quote_card"],
      cost_speak: ["comparison", "checklist"],
      humor_speak: ["quote_card", "tip_graphic"],
      // personal_take gets no LLM image fields, so it only renders correctly
      // on the photo templates the fallback below fills from the post's own
      // copy. Anything else would come out with empty text.
      personal_take: ["photo_overlay_right", "photo_landscape"],
    };

    // 7. Combine posts with schedule, image assignment, and category.
    // When includeImages is false, every post is forced text-only and all
    // image-related columns are nulled out — the assignImageTemplate path
    // is skipped entirely.
    // Resolve a post's 1-based headline_index back to the item it referred to.
    // The index is scoped to the headlines that category was shown.
    const headlineColumnsFor = (
      category: ContentCategory,
      post: GeneratedPost
    ): { headline_source_url: string | null; headline_text: string | null } => {
      const forCategory = headlinesForCategory(category, pickedHeadlines);
      const index = post.headline_index;
      if (typeof index !== "number" || index < 1 || index > forCategory.length) {
        return { headline_source_url: null, headline_text: null };
      }
      const item = forCategory[index - 1];
      return {
        headline_source_url: item.source_url || null,
        headline_text: item.headline || null,
      };
    };

    const postsToInsert = postsToSchedule.map((item, index) => {
      const sched = schedule[index];

      const image = !includeImages
        ? { has_image: false, image_template_type: null as ImageTemplateType | null }
        : testMode
        ? {
            has_image: true,
            image_template_type:
              TEST_MODE_TEMPLATES[item.category]?.[item.indexInCategory] || "stat_card",
          }
        : assignImageTemplate(item.category, item.indexInCategory);

      // personal_take posts don't go through the LLM image-fields path, so
      // when photo_landscape lands on one we copy the post's own copy into
      // the image fields. Otherwise the photo template would render with
      // empty text.
      let imageHeadline = includeImages ? (item.post.image_headline || null) : null;
      let imageBody = includeImages ? (item.post.image_body || null) : null;
      // personal_take posts aren't in IMAGE_CATEGORIES so the LLM didn't
      // produce image_headline / image_body. When a photo-based template
      // lands on one, fall back to the post's own copy as the headline.
      const personalTakePhotoTemplates = new Set([
        "photo_landscape",
        "photo_overlay_right",
        "photo_overlay_left",
      ]);
      if (
        includeImages &&
        item.category === "personal_take" &&
        image.image_template_type &&
        personalTakePhotoTemplates.has(image.image_template_type)
      ) {
        imageHeadline = item.post.linkedin_personal_content || item.post.linkedin_content;
        imageBody = "— Speck Hansen, Insero";
      }

      return {
        batch_id: batch!.id,
        post_number: sched.post_number,
        scheduled_date: sched.scheduled_date,
        scheduled_time_1: sched.scheduled_time_1,
        scheduled_time_2: sched.scheduled_time_2,
        time_slot: sched.time_slot,
        content_category: item.category,
        linkedin_content: item.post.linkedin_content,
        // The model's first draft, frozen. "Learn from my edits" diffs the
        // approved content against these to see what Speck actually changes.
        original_linkedin_content: item.post.linkedin_content,
        original_linkedin_personal_content:
          item.category === "personal_take"
            ? item.post.linkedin_personal_content
            : "",
        // Only personal_take posts reach Speck's profile (skill file, Voice B —
        // "How the profile is fed"). Blanking the variant everywhere else means
        // there is nothing to approve or publish by accident.
        linkedin_personal_content:
          item.category === "personal_take"
            ? item.post.linkedin_personal_content
            : "",
        // Disabled platforms are stored as empty strings — the column stays,
        // the publisher stays, there is just nothing to publish.
        x_content: enabledPlatforms.includes("x") ? item.post.x_content : "",
        facebook_content: enabledPlatforms.includes("facebook")
          ? item.post.facebook_content
          : "",
        google_content: enabledPlatforms.includes("google")
          ? item.post.google_content
          : "",
        has_image: image.has_image,
        image_template_type: image.image_template_type,
        image_headline: imageHeadline,
        image_body: imageBody,
        image_stat_number: includeImages ? (item.post.image_stat_number || null) : null,
        image_stat_label: includeImages ? (item.post.image_stat_label || null) : null,
        status: "draft",
        ...headlineColumnsFor(item.category, item.post),
      };
    });

    // 8. Insert all posts
    const { data: insertedPosts, error: insertError } = await supabase
      .from("posts")
      .insert(postsToInsert)
      .select("id, has_image, image_template_type, image_headline, image_body, image_stat_number, image_stat_label, content_category");

    if (insertError) {
      console.error("Post insertion error:", insertError);
      // Clean up the batch if posts fail
      await supabase.from("batches").delete().eq("id", batch!.id);
      return NextResponse.json(
        { error: "Failed to save posts" },
        { status: 500 }
      );
    }

    // 9. Generate images for posts with has_image: true (non-blocking).
    // Skipped entirely when includeImages is false.
    if (insertedPosts && includeImages) {
      const postsWithImages = insertedPosts.filter((p) => p.has_image);
      const baseUrl = request.nextUrl.origin;

      // Fire image generation but don't await — let it run in background
      Promise.all(
        postsWithImages.map((p) =>
          generateImagesForPost(
            p.id,
            p.image_template_type,
            {
              headline: p.image_headline || "",
              bodyText: p.image_body || "",
              statNumber: p.image_stat_number || undefined,
              statLabel: p.image_stat_label || undefined,
              category: p.content_category,
            },
            baseUrl
          ).catch((err) => {
            console.error(`Image gen failed for post ${p.id}:`, err);
          })
        )
      ).catch((err) => {
        console.error("Batch image generation error:", err);
      });
    }

    return NextResponse.json({ batchId: batch!.id, totalPosts: postsToSchedule.length });
  } catch (error) {
    console.error("Generation error:", error);

    // Clean up the empty batch if it was created
    if (batch?.id) {
      const supabase = getSupabase();
      await supabase.from("batches").delete().eq("id", batch!.id);
    }

    let message = "Unknown error occurred";
    if (error instanceof Error) {
      if (error.message.includes("credit balance is too low")) {
        message = "Anthropic API credit balance is too low. Please add credits at console.anthropic.com/settings/billing";
      } else if (error.message.includes("authentication")) {
        message = "Anthropic API key is invalid or missing. Please check your ANTHROPIC_API_KEY in .env.local";
      } else {
        message = error.message;
      }
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
