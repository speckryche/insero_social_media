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
  SLOTS_PER_WEEK,
  loadTakenSlotsForWeek,
  countFreeSlots,
  allocateByMix,
  buildSchedule,
  interleaveCategories,
  generateCategoryPosts,
  type BatchScope,
  type GeneratedPost,
  type GenerationGuidance,
} from "@/lib/batch-generation";
import Anthropic from "@anthropic-ai/sdk";
import {
  nextMonday,
  isMonday,
  isISODate,
  dayName,
  mondayOf,
  parseISODate,
  toISODate,
  formatWeekRange,
} from "@/lib/week";

// GET /api/generate-batch?weekStart=YYYY-MM-DD — how full a week is, without
// generating anything.
//
// The Generate dialog has to show "X of 10 slots free" for the week being
// picked, which is before any POST happens. It reads that here rather than
// running its own contention query, so the number it shows and the number the
// POST enforces can never drift apart. Defaults to next Monday, same as POST.
const SCOPE_LABELS: Record<BatchScope, string> = {
  both: "Company + Personal",
  company: "Company only",
  personal: "Personal only",
};

export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get("weekStart");
    const weekStart = raw && raw !== "" ? raw : nextMonday();

    // Slots are per scope, so the answer depends on which one is being asked
    // about. "both" is the conservative default: it needs a slot free in the
    // company lane and the personal lane at once.
    const rawScope = request.nextUrl.searchParams.get("scope") || "both";
    if (!["both", "company", "personal"].includes(rawScope)) {
      return NextResponse.json(
        { error: `Invalid scope: ${rawScope}` },
        { status: 400 }
      );
    }
    const scope = rawScope as BatchScope;

    if (!isISODate(weekStart)) {
      return NextResponse.json(
        { error: `Invalid weekStart: ${weekStart}. Expected a calendar date as YYYY-MM-DD.` },
        { status: 400 }
      );
    }
    if (!isMonday(weekStart)) {
      return NextResponse.json(
        {
          error:
            `weekStart must be a Monday. ${weekStart} is a ${dayName(weekStart)} — ` +
            `the Monday of that week is ${mondayOf(parseISODate(weekStart))}.`,
        },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const takenSlots = await loadTakenSlotsForWeek(supabase, weekStart, scope);

    return NextResponse.json({
      weekStart,
      weekLabel: formatWeekRange(weekStart),
      scope,
      slotsTotal: SLOTS_PER_WEEK,
      slotsFree: countFreeSlots(weekStart, takenSlots),
      hasStarted: weekStart < toISODate(new Date()),
    });
  } catch (error) {
    console.error("[generate-batch] slot lookup failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let batch: { id: string } | null = null;
  try {
    const {
      weekStart: rawWeekStart,
      // A week already under way is refused unless the caller means it.
      allowPast = false,
      testMode,
      scope: rawScope = "both",
      postCount: rawPostCount = DEFAULT_POST_COUNT,
      scanId,
      headlineIds,
    } = await request.json();

    // A scheduler can post no date at all and mean "the coming week", which
    // is what makes a weekly cron a fixed body with no date maths in it.
    const weekStart: string =
      rawWeekStart === undefined || rawWeekStart === null || rawWeekStart === ""
        ? nextMonday()
        : String(rawWeekStart);

    if (!isISODate(weekStart)) {
      return NextResponse.json(
        {
          error: `Invalid weekStart: ${JSON.stringify(rawWeekStart)}. Expected a calendar date as YYYY-MM-DD.`,
        },
        { status: 400 }
      );
    }

    // The database enforces this too (batches_week_start_is_monday), but a
    // constraint violation reads like a bug. Say which day they sent and what
    // the right Monday would have been.
    if (!isMonday(weekStart)) {
      return NextResponse.json(
        {
          error:
            `weekStart must be a Monday. ${weekStart} is a ${dayName(weekStart)} — ` +
            `the Monday of that week is ${mondayOf(parseISODate(weekStart))}.`,
        },
        { status: 400 }
      );
    }

    // Half a started week's slots are already in the past, so filling it is
    // almost always a mistake. Backfilling stays possible on purpose.
    if (!allowPast && weekStart < toISODate(new Date())) {
      return NextResponse.json(
        {
          error:
            `The week of ${formatWeekRange(weekStart)} has already started. ` +
            `Pass allowPast: true to generate into it anyway.`,
        },
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

    // What the week already owes this scope. Note the two rules read different
    // sets on purpose: the conflict rule below ignores completed batches,
    // because a finished week shouldn't block a new one — but slot contention
    // counts every batch including completed ones, since a post that already
    // went out on Monday morning still occupies Monday morning.
    const takenSlots = await loadTakenSlotsForWeek(supabase, weekStart, scope);
    const slotsFree = countFreeSlots(weekStart, takenSlots);

    // One live batch per week per scope. A "both" batch occupies the company
    // and personal lanes at once, so it conflicts with anything; company-only
    // and personal-only batches can coexist in the same week and, because they
    // publish to different LinkedIn destinations, may even share the same times
    // — each lane has its own slots.
    const { data: existingBatches } = await supabase
      .from("batches")
      .select("id, status, scope")
      .eq("week_start_date", weekStart)
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
      const describe = (value: BatchScope) => SCOPE_LABELS[value];

      const reason =
        existingScope === scope
          ? `A ${describe(scope)} batch already exists for the week of ${formatWeekRange(weekStart)} (status: ${conflicting.status}).`
          : `A ${describe(existingScope)} batch already exists for the week of ${formatWeekRange(weekStart)} (status: ${conflicting.status}), and it overlaps a ${describe(scope)} batch.`;

      const suggestion =
        existingScope === "both" || scope === "both"
          ? " Delete it, choose a different week, or generate the two halves separately as Company only and Personal only."
          : " Delete it or choose a different week.";

      return NextResponse.json(
        {
          error: reason + suggestion,
          weekStart,
          scope,
          slotsTotal: SLOTS_PER_WEEK,
          slotsFree,
          existingBatchId: conflicting.id,
        },
        { status: 409 }
      );
    }

    // Slot contention is real now: a week has only SLOTS_PER_WEEK slots and a
    // company batch and a personal batch share them.
    if (slotsFree === 0) {
      return NextResponse.json(
        {
          error:
            `Every ${SCOPE_LABELS[scope]} slot in the week of ${formatWeekRange(weekStart)} is already taken. ` +
            `A week holds ${SLOTS_PER_WEEK} posts per scope. Delete a batch in that week or choose another week.`,
          weekStart,
          scope,
          slotsTotal: SLOTS_PER_WEEK,
          slotsFree: 0,
        },
        { status: 409 }
      );
    }

    // 1. Create the batch record.
    // The week is the ceiling twice over: SLOTS_PER_WEEK in total, and only
    // slotsFree of those actually available. Asking for more than is free
    // shortens the batch rather than double-booking a slot.
    const requestedPosts = testMode
      ? Math.min(categoriesToGenerate.length * 2, SLOTS_PER_WEEK)
      : totalPostsForBatch(postCount);
    const totalPosts = Math.min(requestedPosts, slotsFree);

    if (totalPosts < requestedPosts) {
      console.log(
        `[generate-batch] week of ${weekStart} has ${slotsFree} free slot(s) — ` +
          `shortening from ${requestedPosts} to ${totalPosts}`
      );
    }

    const { data: batchData, error: batchError } = await supabase
      .from("batches")
      .insert({
        // month/year are deliberately not written any more; legacy rows keep
        // theirs and batches_period_present accepts either period.
        week_start_date: weekStart,
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
    // for this same week when the dialog sent ids but no scan id.
    let pickedHeadlines: HeadlineItem[] = [];
    if (Array.isArray(headlineIds) && headlineIds.length > 0) {
      let scanQuery = supabase.from("headline_scans").select("id, items");
      scanQuery = scanId
        ? scanQuery.eq("id", scanId)
        : scanQuery
            .eq("week_start_date", weekStart)
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

    // 5. Build schedule
    const schedule = buildSchedule(weekStart, settings, totalPosts, takenSlots);

    // 6. Trim posts to fit the slots the week actually has left. Posts that
    //    reference a headline go first — news gets stale, so it takes the
    //    earliest slots in the week. Order is otherwise the interleave order,
    //    which keeps categories varied within each group.
    const usesHeadline = (item: (typeof interleaved)[number]) =>
      headlinesForCategory(item.category, pickedHeadlines).length > 0 &&
      typeof item.post.headline_index === "number";

    const ordered = [
      ...interleaved.filter(usesHeadline),
      ...interleaved.filter((item) => !usesHeadline(item)),
    ];
    const postsToSchedule = ordered.slice(0, schedule.length);

    // 7. Combine posts with schedule and category. Posts are created with
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
      const sched = schedule[index];

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
      totalPosts: postsToSchedule.length,
      weekStart,
      scope,
      slotsTotal: SLOTS_PER_WEEK,
      // What the week has left now this batch has taken its share, so the
      // dialog can show it without recomputing contention itself.
      slotsFree: slotsFree - postsToSchedule.length,
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
