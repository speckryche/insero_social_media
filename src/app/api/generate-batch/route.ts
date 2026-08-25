import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import {
  buildCategoryPrompt,
  ContentCategory,
} from "@/lib/prompts";

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
  "bill_speak",
  "contract_speak",
  "quote_speak",
  "tech_speak",
  "personal_take",
];

// Share of every batch by category, per the content plan. Sums to 1.0.
const CATEGORY_MIX: Record<ContentCategory, number> = {
  bill_speak: 0.20,
  contract_speak: 0.20,
  quote_speak: 0.15,
  tech_speak: 0.20,
  personal_take: 0.25,
};

// Largest-remainder apportionment, so the per-category counts always sum to
// exactly totalPosts no matter how many days the month has.
function allocateByMix(totalPosts: number): Map<ContentCategory, number> {
  const exact = CATEGORIES.map((category) => ({
    category,
    value: totalPosts * CATEGORY_MIX[category],
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
}

function assignImageTemplate(
  category: ContentCategory,
  indexInCategory: number
): { has_image: boolean; image_template_type: ImageTemplateType | null } {
  // Base assignment (existing canvas-template rules)
  let base: { has_image: boolean; image_template_type: ImageTemplateType | null };
  switch (category) {
    case "bill_speak":
      base = indexInCategory >= 8
        ? { has_image: false, image_template_type: null }
        : {
            has_image: true,
            image_template_type: indexInCategory % 2 === 0 ? "stat_card" : "did_you_know",
          };
      break;
    case "quote_speak":
      base = indexInCategory % 2 === 0
        ? {
            has_image: true,
            image_template_type: indexInCategory % 4 === 0 ? "quote_card" : "savings_highlight",
          }
        : { has_image: false, image_template_type: null };
      break;
    case "tech_speak":
      base = indexInCategory % 2 === 1
        ? {
            has_image: true,
            image_template_type: indexInCategory % 4 === 1 ? "tip_graphic" : "checklist",
          }
        : { has_image: false, image_template_type: null };
      break;
    case "contract_speak":
      base = indexInCategory % 2 === 0
        ? {
            has_image: true,
            image_template_type: indexInCategory % 4 === 0 ? "comparison" : "checklist",
          }
        : { has_image: false, image_template_type: null };
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

  if (category === "bill_speak") {
    // 35% overlay_right, 15% overlay_left, 25% photo_stat, 25% existing canvas
    // (alternates stat_card / did_you_know — mirrors the base rule)
    if (rand < 0.35) return { has_image: true, image_template_type: "photo_overlay_right" };
    if (rand < 0.50) return { has_image: true, image_template_type: "photo_overlay_left" };
    if (rand < 0.75) return { has_image: true, image_template_type: "photo_stat" };
    return {
      has_image: true,
      image_template_type: indexInCategory % 2 === 0 ? "stat_card" : "did_you_know",
    };
  }

  if (category === "contract_speak") {
    // 35% overlay_right, 15% overlay_left, 25% checklist, 25% comparison —
    // clause breakdowns read best as lists and before/after pairs.
    if (rand < 0.35) return { has_image: true, image_template_type: "photo_overlay_right" };
    if (rand < 0.50) return { has_image: true, image_template_type: "photo_overlay_left" };
    if (rand < 0.75) return { has_image: true, image_template_type: "checklist" };
    return { has_image: true, image_template_type: "comparison" };
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

  let postNumber = 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth && postNumber <= maxPosts; day++) {
    const date = new Date(year, month - 1, day);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekend = isWeekend(date);

    const morningTime = weekend
      ? settings.weekend_morning_time
      : settings.weekday_morning_time;
    const afternoonTime = weekend
      ? settings.weekend_afternoon_time
      : settings.weekday_afternoon_time;

    // Morning post
    schedule.push({
      scheduled_date: dateStr,
      time_slot: "morning",
      scheduled_time_1: morningTime,
      scheduled_time_2: afternoonTime,
      post_number: postNumber++,
    });

    // Afternoon post
    if (postNumber <= maxPosts) {
      schedule.push({
        scheduled_date: dateStr,
        time_slot: "afternoon",
        scheduled_time_1: morningTime,
        scheduled_time_2: afternoonTime,
        post_number: postNumber++,
      });
    }
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

// Strips markdown code fences the model sometimes adds despite being told not
// to. Handles both a fenced whole response and stray prose around the array.
function stripCodeFences(raw: string): string {
  let text = raw.trim();

  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    text = text.trim();
  }

  // If anything still surrounds the array, keep only the array itself.
  if (!text.startsWith("[")) {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end > start) {
      text = text.slice(start, end + 1);
    }
  }

  return text;
}

// The model writes multi-paragraph posts, and it occasionally emits a real
// newline inside a JSON string value instead of \n — which makes JSON.parse
// fail with "Unterminated string in JSON at position N". Walk the text and
// escape raw control characters that appear inside string values, leaving
// structural whitespace between tokens untouched.
function escapeRawControlCharsInStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (const ch of text) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }

    if (inString) {
      if (ch === "\n") {
        out += "\\n";
        continue;
      }
      if (ch === "\r") {
        out += "\\r";
        continue;
      }
      if (ch === "\t") {
        out += "\\t";
        continue;
      }
    }

    out += ch;
  }

  return out;
}

async function generateCategoryPosts(
  anthropic: Anthropic,
  category: ContentCategory,
  contentNotes?: string,
  postCount: number = 12
): Promise<GeneratedPost[]> {
  const systemPrompt = contentNotes
    ? `${SYSTEM_PROMPT}\n\nADDITIONAL GUIDANCE FROM THE USER:\n${contentNotes}`
    : SYSTEM_PROMPT;

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
      // is really just JSON assembly from an explicit spec.
      output_config: { effort: "low" },
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: buildCategoryPrompt(category, postCount),
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

  return posts;
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
    const { month, year, testMode, includeImages = true } = await request.json();

    if (!month || !year || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Invalid month or year" },
        { status: 400 }
      );
    }

    // Test mode: 2 posts per category (4 company categories) = 8 total posts
    const categoriesToGenerate: ContentCategory[] = testMode
      ? ["bill_speak", "contract_speak", "quote_speak", "tech_speak"]
      : CATEGORIES;

    const supabase = getSupabase();
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    // Check for existing batch in this month
    const { data: existingBatch } = await supabase
      .from("batches")
      .select("id, status")
      .eq("month", month)
      .eq("year", year)
      .neq("status", "completed")
      .maybeSingle();

    if (existingBatch) {
      return NextResponse.json(
        {
          error: `A batch already exists for this month (status: ${existingBatch.status}). Delete it first or choose a different month.`,
        },
        { status: 409 }
      );
    }

    // 1. Create the batch record
    const daysInMonth = new Date(year, month, 0).getDate();
    const totalPosts = testMode ? 8 : Math.min(60, daysInMonth * 2);

    const { data: batchData, error: batchError } = await supabase
      .from("batches")
      .insert({ month, year, status: "draft", total_posts: totalPosts })
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
    const contentNotes = settings.content_notes || "";
    const postsByCategory = new Map<ContentCategory, GeneratedPost[]>();

    // Per-category counts: flat 2 each in test mode, otherwise apportioned
    // across the month by CATEGORY_MIX.
    const categoryCounts = testMode
      ? new Map<ContentCategory, number>(categoriesToGenerate.map((c) => [c, 2]))
      : allocateByMix(totalPosts);

    for (const category of categoriesToGenerate) {
      const count = categoryCounts.get(category) ?? 0;
      if (count === 0) continue;
      const posts = await generateCategoryPosts(anthropic, category, contentNotes, count);
      postsByCategory.set(category, posts);
    }

    // 4. Interleave categories for varied daily content
    const interleaved = interleaveCategories(postsByCategory);

    // 5. Build schedule
    const schedule = buildSchedule(month, year, settings, totalPosts);

    // 6. Trim posts to fit available schedule slots (shorter months have fewer days)
    const postsToSchedule = interleaved.slice(0, schedule.length);

    // Test mode template assignments: map category + index-in-category to a specific template
    const TEST_MODE_TEMPLATES: Record<string, ImageTemplateType[]> = {
      bill_speak: ["stat_card", "did_you_know"],
      contract_speak: ["checklist", "comparison"],
      quote_speak: ["savings_highlight", "quote_card"],
      tech_speak: ["tip_graphic", "photo_tip"],
    };

    // 7. Combine posts with schedule, image assignment, and category.
    // When includeImages is false, every post is forced text-only and all
    // image-related columns are nulled out — the assignImageTemplate path
    // is skipped entirely.
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
        linkedin_personal_content: item.post.linkedin_personal_content,
        x_content: item.post.x_content,
        facebook_content: item.post.facebook_content,
        google_content: item.post.google_content,
        has_image: image.has_image,
        image_template_type: image.image_template_type,
        image_headline: imageHeadline,
        image_body: imageBody,
        image_stat_number: includeImages ? (item.post.image_stat_number || null) : null,
        image_stat_label: includeImages ? (item.post.image_stat_label || null) : null,
        status: "draft",
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
