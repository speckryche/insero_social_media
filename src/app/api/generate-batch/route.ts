import { NextRequest, NextResponse } from "next/server";
import { parseListSetting, type ContentCategory } from "@/lib/prompts";
import { parseEnabledPlatforms } from "@/lib/platforms";
import { isHeadlineItem, headlinesForCategory, type HeadlineItem } from "@/lib/headlines";
import {
  getSupabase,
  categoriesForScope,
  POST_COUNT_PRESETS,
  DEFAULT_POST_COUNT,
  totalPostsForBatch,
  defaultPostTimes,
  allocateByMix,
  interleaveCategories,
  generateCategoryPosts,
  type BatchScope,
  type GeneratedPost,
  type GenerationGuidance,
} from "@/lib/batch-generation";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  let batch: { id: string } | null = null;
  try {
    const {
      testMode,
      scope: rawScope = "both",
      postCount: rawPostCount = DEFAULT_POST_COUNT,
      scanId,
      headlineIds,
    } = await request.json();

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

    // Batches are a numbered list: the next number is simply one past the
    // highest so far. Legacy week/month rows have no number and sort after.
    const { data: lastNumbered } = await supabase
      .from("batches")
      .select("batch_number")
      .not("batch_number", "is", null)
      .order("batch_number", { ascending: false })
      .limit(1);

    const batchNumber = (lastNumbered?.[0]?.batch_number ?? 0) + 1;

    // 1. Create the batch record.
    const requestedPosts = testMode
      ? categoriesToGenerate.length * 2
      : totalPostsForBatch(postCount);
    const totalPosts = requestedPosts;

    const { data: batchData, error: batchError } = await supabase
      .from("batches")
      .insert({
        // week_start_date / month / year are deliberately not written any
        // more. Legacy rows keep theirs so their period still renders.
        batch_number: batchNumber,
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
    // Picked headlines, if the user ran a scan. Scans are no longer keyed to a
    // period, so with no scan id the newest one wins.
    let pickedHeadlines: HeadlineItem[] = [];
    if (Array.isArray(headlineIds) && headlineIds.length > 0) {
      let scanQuery = supabase.from("headline_scans").select("id, items");
      scanQuery = scanId
        ? scanQuery.eq("id", scanId)
        : scanQuery.order("created_at", { ascending: false }).limit(1);

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
    // across the week by CATEGORY_MIX.
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

    // 5. Trim to the requested size. Posts that reference a headline go
    //    first — news gets stale, so it takes the low post numbers. Order is
    //    otherwise the interleave order, which keeps categories varied.
    const usesHeadline = (item: (typeof interleaved)[number]) =>
      headlinesForCategory(item.category, pickedHeadlines).length > 0 &&
      typeof item.post.headline_index === "number";

    const ordered = [
      ...interleaved.filter(usesHeadline),
      ...interleaved.filter((item) => !usesHeadline(item)),
    ];
    const postsToSchedule = ordered.slice(0, totalPosts);
    const postTimes = defaultPostTimes(settings);

    // 6. Combine posts with their number and category. Posts are created with
    // no image at all now — images arrive later via the per-scope upload
    // drop zones, which write linkedin_image_url / linkedin_personal_image_url.
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
      return {
        batch_id: batch!.id,
        post_number: index + 1,
        // No date and no slot — scheduling is retired. The two time columns
        // are still NOT NULL in the database, so they take the defaults.
        scheduled_date: null,
        time_slot: null,
        ...postTimes,
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
        status: "draft",
        ...headlineColumnsFor(item.category, item.post),
      };
    });

    // 8. Insert all posts
    const { error: insertError } = await supabase
      .from("posts")
      .insert(postsToInsert)
      .select("id");

    if (insertError) {
      console.error("Post insertion error:", insertError);
      // Clean up the batch if posts fail
      await supabase.from("batches").delete().eq("id", batch!.id);
      return NextResponse.json(
        { error: "Failed to save posts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      batchId: batch!.id,
      batchNumber,
      totalPosts: postsToSchedule.length,
      scope,
      requestedPosts,
      shortened: postsToSchedule.length < requestedPosts,
    });
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
