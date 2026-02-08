import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import {
  INSERO_SYSTEM_PROMPT,
  buildCategoryPrompt,
  ContentCategory,
} from "@/lib/prompts";

// Use service role for server-side operations
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const CATEGORIES: ContentCategory[] = [
  "did_you_know",
  "savings_story",
  "industry_tip",
  "myth_busting",
  "personal_take",
];

type ImageTemplateType = "stat_card" | "quote_card" | "tip_graphic" | "comparison";

interface GeneratedPost {
  linkedin_content: string;
  x_content: string;
  facebook_content: string;
  google_content: string;
}

function assignImageTemplate(
  category: ContentCategory,
  indexInCategory: number
): { has_image: boolean; image_template_type: ImageTemplateType | null } {
  switch (category) {
    case "did_you_know":
      // All "Did You Know" posts get stat_card
      return { has_image: true, image_template_type: "stat_card" };
    case "savings_story":
      // ~50% get quote_card (6 out of 12)
      return indexInCategory % 2 === 0
        ? { has_image: true, image_template_type: "quote_card" }
        : { has_image: false, image_template_type: null };
    case "industry_tip":
      // ~50% get tip_graphic (6 out of 12)
      return indexInCategory % 2 === 1
        ? { has_image: true, image_template_type: "tip_graphic" }
        : { has_image: false, image_template_type: null };
    case "myth_busting":
      // Mostly text-only
      return { has_image: false, image_template_type: null };
    case "personal_take":
      // Always text-only
      return { has_image: false, image_template_type: null };
    default:
      return { has_image: false, image_template_type: null };
  }
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
  settings: AppSettings
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

  for (let day = 1; day <= daysInMonth && postNumber <= 60; day++) {
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
    if (postNumber <= 60) {
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
  const maxPerCategory = 12;
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

async function generateCategoryPosts(
  anthropic: Anthropic,
  category: ContentCategory,
  contentNotes?: string
): Promise<GeneratedPost[]> {
  const systemPrompt = contentNotes
    ? `${INSERO_SYSTEM_PROMPT}\n\nADDITIONAL GUIDANCE FROM THE USER:\n${contentNotes}`
    : INSERO_SYSTEM_PROMPT;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: buildCategoryPrompt(category),
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`No text response for category: ${category}`);
  }

  let jsonText = textBlock.text.trim();

  // Strip markdown code fences if present
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const posts: GeneratedPost[] = JSON.parse(jsonText);

  if (!Array.isArray(posts) || posts.length !== 12) {
    throw new Error(
      `Expected 12 posts for ${category}, got ${Array.isArray(posts) ? posts.length : "non-array"}`
    );
  }

  return posts;
}

export async function POST(request: NextRequest) {
  try {
    const { month, year } = await request.json();

    if (!month || !year || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Invalid month or year" },
        { status: 400 }
      );
    }

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
    const { data: batch, error: batchError } = await supabase
      .from("batches")
      .insert({ month, year, status: "draft", total_posts: 60 })
      .select()
      .single();

    if (batchError || !batch) {
      console.error("Batch creation error:", batchError);
      return NextResponse.json(
        { error: "Failed to create batch" },
        { status: 500 }
      );
    }

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

    // 3. Generate posts — one category at a time (5 API calls)
    const contentNotes = settings.content_notes || "";
    const postsByCategory = new Map<ContentCategory, GeneratedPost[]>();

    for (const category of CATEGORIES) {
      const posts = await generateCategoryPosts(anthropic, category, contentNotes);
      postsByCategory.set(category, posts);
    }

    // 4. Interleave categories for varied daily content
    const interleaved = interleaveCategories(postsByCategory);

    // 5. Build schedule
    const schedule = buildSchedule(month, year, settings);

    // 6. Combine posts with schedule, image assignment, and category
    const postsToInsert = interleaved.map((item, index) => {
      const sched = schedule[index];
      const image = assignImageTemplate(item.category, item.indexInCategory);

      return {
        batch_id: batch.id,
        post_number: sched.post_number,
        scheduled_date: sched.scheduled_date,
        scheduled_time_1: sched.scheduled_time_1,
        scheduled_time_2: sched.scheduled_time_2,
        time_slot: sched.time_slot,
        content_category: item.category,
        linkedin_content: item.post.linkedin_content,
        x_content: item.post.x_content,
        facebook_content: item.post.facebook_content,
        google_content: item.post.google_content,
        has_image: image.has_image,
        image_template_type: image.image_template_type,
        status: "draft",
      };
    });

    // 7. Insert all posts
    const { error: insertError } = await supabase
      .from("posts")
      .insert(postsToInsert);

    if (insertError) {
      console.error("Post insertion error:", insertError);
      // Clean up the batch if posts fail
      await supabase.from("batches").delete().eq("id", batch.id);
      return NextResponse.json(
        { error: "Failed to save posts" },
        { status: 500 }
      );
    }

    return NextResponse.json({ batchId: batch.id, totalPosts: 60 });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
