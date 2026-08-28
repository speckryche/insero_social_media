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
  assignImageTemplate,
  buildAllSlots,
  buildWeekSlots,
  loadTakenSlotsForWeek,
  selectEvenly,
  slotKey,
  SLOTS_PER_WEEK,
  generateCategoryPosts,
  type BatchScope,
  type ImageTemplateType,
  type GeneratedPost,
  type GenerationGuidance,
} from "@/lib/batch-generation";

const MAX_ADD = 10;

// Photo templates the personal_take fallback can fill from the post's own copy.
const PERSONAL_PHOTO_TEMPLATES = new Set([
  "photo_landscape",
  "photo_overlay_right",
  "photo_overlay_left",
]);

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
      includeImages = true,
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
      .select("id, month, year, week_start_date, scope, total_posts")
      .eq("id", params.id)
      .single();

    if (batchError || !batch) {
      return NextResponse.json(
        { error: batchError?.message || "Batch not found" },
        { status: 404 }
      );
    }

    // A weekly batch schedules into its own Mon-Fri week. A legacy monthly
    // batch has no week_start_date and keeps using the whole month.
    const weekStart = batch.week_start_date
      ? String(batch.week_start_date)
      : null;

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
      const scanQuery = supabase.from("headline_scans").select("picked");
      const { data: scans } = await (weekStart
        ? scanQuery.eq("week_start_date", weekStart)
        : scanQuery.eq("month", batch.month).eq("year", batch.year))
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
    let posts = generated.slice(0, count);
    if (posts.length === 0) {
      return NextResponse.json(
        { error: "The model returned no posts. Try again." },
        { status: 500 }
      );
    }

    // --- scheduling --------------------------------------------------------
    const { data: existingPosts } = await supabase
      .from("posts")
      .select("post_number, scheduled_date, time_slot, content_category")
      .eq("batch_id", params.id);

    // Legacy monthly batches keep using the whole month, weekends and all —
    // the monthly drafts already in the database have to go on working
    // exactly as they did.
    const allSlots = weekStart
      ? buildWeekSlots(weekStart, settings)
      : buildAllSlots(Number(batch.month), Number(batch.year), settings);

    // Contention differs by era. A week is shared with every other batch in
    // it, so read what is taken through the same helper the generate route
    // uses — that is what stops the two paths disagreeing. A legacy monthly
    // batch only ever competed with itself.
    const taken = weekStart
      ? await loadTakenSlotsForWeek(
          supabase,
          weekStart,
          (batch.scope as BatchScope) ?? "both"
        )
      : new Set(
          (existingPosts || []).map((p) =>
            slotKey({
              scheduled_date: String(p.scheduled_date),
              time_slot: String(p.time_slot),
            })
          )
        );

    const freeSlots = allSlots.filter((slot) => !taken.has(slotKey(slot)));
    const chosenSlots = selectEvenly(freeSlots, posts.length);

    if (chosenSlots.length < posts.length) {
      if (weekStart) {
        // The week caps out at SLOTS_PER_WEEK. Shorten the add rather than
        // double-book a slot — the same rule the generate route follows.
        if (chosenSlots.length === 0) {
          return NextResponse.json(
            {
              error: `No free slots left in the week of ${weekStart}. A week holds ${SLOTS_PER_WEEK} posts and all of them are taken.`,
            },
            { status: 409 }
          );
        }
        console.log(
          `[add-posts] week ${weekStart} has ${chosenSlots.length} free slot(s) — adding ${chosenSlots.length} of ${posts.length}`
        );
        posts = posts.slice(0, chosenSlots.length);
      } else {
        // Legacy months double up only when the month is genuinely full.
        const shortfall = posts.length - chosenSlots.length;
        console.log(
          `[add-posts] month is full — reusing ${shortfall} existing slot(s)`
        );
        chosenSlots.push(...selectEvenly(allSlots, shortfall));
      }
    }

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

    // Continue the per-category index so image templates keep rotating rather
    // than restarting at 0 for every add.
    const existingInCategory = (existingPosts || []).filter(
      (p) => p.content_category === category
    ).length;

    const rows = ordered.map((post, i) => {
      const slot = chosenSlots[i];
      const indexInCategory = existingInCategory + i;

      const image = !includeImages
        ? { image_template_type: null as ImageTemplateType | null }
        : assignImageTemplate(category, indexInCategory);

      let imageHeadline = includeImages ? post.image_headline || null : null;
      let imageBody = includeImages ? post.image_body || null : null;

      // personal_take gets no LLM image fields, so a photo template has to be
      // filled from the post's own copy — same fallback the batch path uses.
      if (
        includeImages &&
        category === "personal_take" &&
        image.image_template_type &&
        PERSONAL_PHOTO_TEMPLATES.has(image.image_template_type)
      ) {
        imageHeadline = post.linkedin_personal_content || post.linkedin_content;
        imageBody = "— Speck Hansen, Insero";
      }

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
        scheduled_date: slot.scheduled_date,
        scheduled_time_1: slot.scheduled_time_1,
        scheduled_time_2: slot.scheduled_time_2,
        time_slot: slot.time_slot,
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
        image_template_type: image.image_template_type,
        image_headline: imageHeadline,
        image_body: imageBody,
        image_stat_number: includeImages ? post.image_stat_number || null : null,
        image_stat_label: includeImages ? post.image_stat_label || null : null,
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
