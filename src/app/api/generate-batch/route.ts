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
  allocateByMix,
  assignImageTemplate,
  buildSchedule,
  interleaveCategories,
  generateCategoryPosts,
  generateImagesForPost,
  type BatchScope,
  type ImageTemplateType,
  type GeneratedPost,
  type GenerationGuidance,
} from "@/lib/batch-generation";
import Anthropic from "@anthropic-ai/sdk";

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
      pots_speak: ["checklist", "tip_graphic"],
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
