import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { type ContentCategory } from "@/lib/prompts";
import { parseEnabledPlatforms } from "@/lib/platforms";
import {
  headlinesForCategory,
  isHeadlineItem,
  type HeadlineItem,
} from "@/lib/headlines";
import {
  getSupabase,
  categoriesForScope,
  defaultPostTimes,
  generateCategoryPosts,
  type BatchScope,
  type GeneratedPost,
  type GenerationGuidance,
} from "@/lib/batch-generation";

const MAX_ADD = 10;

// POST — generate `count` more posts of one category into an existing batch.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const {
      category: rawCategory,
      count: rawCount,
      useHeadlines = false,
    } = await request.json();

    const count = Number(rawCount);
    if (!Number.isInteger(count) || count < 1 || count > MAX_ADD) {
      return NextResponse.json(
        { error: `count must be a whole number from 1 to ${MAX_ADD}` },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data: batch, error: batchError } = await supabase
      .from("batches")
      .select("id, batch_number, scope, total_posts")
      .eq("id", params.id)
      .single();

    if (batchError || !batch) {
      return NextResponse.json(
        { error: batchError?.message || "Batch not found" },
        { status: 404 }
      );
    }

    // A weekly batch schedules into its own Mon-Fri week. A legacy monthly

    // The category has to be one this batch's scope actually covers.
    const scope = (batch.scope as BatchScope) || "both";
    const allowed = categoriesForScope(scope);
    const category = rawCategory as ContentCategory;
    if (!allowed.includes(category)) {
      return NextResponse.json(
        {
          error: `${rawCategory} is not valid for a ${scope} batch. Allowed: ${allowed.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    const { data: settings, error: settingsError } = await supabase
      .from("app_settings")
      .select("*")
      .single();

    if (settingsError || !settings) {
      return NextResponse.json(
        { error: settingsError?.message || "Failed to fetch app settings" },
        { status: 500 }
      );
    }

    // Optionally reuse the picks from the most recent scan for this batch's
    // period. Weekly batches look up by week — their month/year are NULL, so
    // the old month/year query silently matched nothing and quietly dropped
    // every picked headline. Legacy monthly batches keep the old lookup.
    let pickedHeadlines: HeadlineItem[] = [];
    if (useHeadlines) {
      const { data: scans } = await supabase
        .from("headline_scans")
        .select("picked")
        .order("created_at", { ascending: false })
        .limit(1);

      pickedHeadlines = ((scans?.[0]?.picked as HeadlineItem[]) || []).filter(
        isHeadlineItem
      );
    }

    const enabledPlatforms = parseEnabledPlatforms(settings.enabled_platforms);
    const guidance: GenerationGuidance = {
      contentNotes: settings.content_notes || "",
      bannedWords: settings.banned_words || "",
      speckIsms: settings.speck_isms || "",
      styleSamples: settings.style_samples || "",
      enabledPlatforms,
      headlines: pickedHeadlines,
    };

    console.log(
      `[add-posts] batch=${params.id} category=${category} count=${count} ` +
        `headlines=${pickedHeadlines.length}`
    );

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const generated = await generateCategoryPosts(
      anthropic,
      category,
      count,
      guidance
    );

    // The model can return more or fewer than asked; take what was requested.
    const posts = generated.slice(0, count);
    if (posts.length === 0) {
      return NextResponse.json(
        { error: "The model returned no posts. Try again." },
        { status: 500 }
      );
    }

    const { data: existingPosts } = await supabase
      .from("posts")
      .select("post_number")
      .eq("batch_id", params.id);

    const startNumber =
      Math.max(0, ...(existingPosts || []).map((p) => Number(p.post_number) || 0)) + 1;

    // Headline posts still take the earliest slots available to this add.
    const categoryHeadlines = headlinesForCategory(category, pickedHeadlines);
    const usesHeadline = (post: GeneratedPost) =>
      categoryHeadlines.length > 0 && typeof post.headline_index === "number";
    const ordered = [
      ...posts.filter(usesHeadline),
      ...posts.filter((post) => !usesHeadline(post)),
    ];

    const postTimes = defaultPostTimes(settings);

    const rows = ordered.map((post, i) => {
      const index = post.headline_index;
      const headlineItem =
        typeof index === "number" &&
        index >= 1 &&
        index <= categoryHeadlines.length
          ? categoryHeadlines[index - 1]
          : null;

      return {
        batch_id: params.id,
        post_number: startNumber + i,
        // No date and no slot — scheduling is retired. The two time columns
        // are still NOT NULL in the database, so they take the defaults.
        scheduled_date: null,
        time_slot: null,
        ...postTimes,
        content_category: category,
        linkedin_content: post.linkedin_content,
        original_linkedin_content: post.linkedin_content,
        linkedin_personal_content:
          category === "personal_take" ? post.linkedin_personal_content : "",
        original_linkedin_personal_content:
          category === "personal_take" ? post.linkedin_personal_content : "",
        x_content: enabledPlatforms.includes("x") ? post.x_content : "",
        facebook_content: enabledPlatforms.includes("facebook")
          ? post.facebook_content
          : "",
        google_content: enabledPlatforms.includes("google")
          ? post.google_content
          : "",
        status: "draft",
        headline_source_url: headlineItem?.source_url || null,
        headline_text: headlineItem?.headline || null,
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from("posts")
      .insert(rows)
      .select();

    if (insertError) {
      console.error("[add-posts] insert failed:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // total_posts tracks the real row count. post_count is the size chosen in
    // the Generate dialog and is deliberately left alone.
    const newTotal = (existingPosts?.length || 0) + (inserted?.length || 0);
    const { error: totalError } = await supabase
      .from("batches")
      .update({ total_posts: newTotal })
      .eq("id", params.id);

    if (totalError) {
      console.error("[add-posts] total_posts update failed:", totalError);
    }

    return NextResponse.json({
      added: inserted?.length || 0,
      totalPosts: newTotal,
      posts: inserted || [],
    });
  } catch (error) {
    console.error("[add-posts] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
