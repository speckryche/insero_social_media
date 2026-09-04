import { NextRequest, NextResponse } from "next/server";
import { parseListSetting, type ContentCategory } from "@/lib/prompts";
import { parseEnabledPlatforms } from "@/lib/platforms";
import {
  isHeadlineItem,
  headlinesForCategory,
  scanScopesForBatch,
  type HeadlineItem,
} from "@/lib/headlines";
import {
  NOTES_PER_SCOPE,
  notesForCategory,
  type NoteScope,
  type RealLifeNote,
} from "@/lib/notes";
import {
  getSupabase,
  categoriesForScope,
  POST_COUNT_PRESETS,
  DEFAULT_POST_COUNT,
  totalPostsForBatch,
  defaultPostTimes,
  allocateByMix,
  interleaveCategories,
  orderBySource,
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
    // Picked headlines, if the user ran a scan. Scans are per feed scope now,
    // so a "both" batch reads the newest scan from each — company feeds and
    // personal feeds never overlap, so the merged ids stay unique.
    let pickedHeadlines: HeadlineItem[] = [];
    if (Array.isArray(headlineIds) && headlineIds.length > 0) {
      const scanned: HeadlineItem[] = [];

      if (scanId) {
        const { data: scans } = await supabase
          .from("headline_scans")
          .select("id, items")
          .eq("id", scanId);
        scanned.push(...((scans?.[0]?.items as HeadlineItem[]) || []));
      } else {
        for (const feedScope of scanScopesForBatch(scope)) {
          const { data: scans } = await supabase
            .from("headline_scans")
            .select("id, items")
            .eq("scope", feedScope)
            .order("created_at", { ascending: false })
            .limit(1);
          scanned.push(...((scans?.[0]?.items as HeadlineItem[]) || []));
        }
      }

      const items = scanned.filter(isHeadlineItem);
      pickedHeadlines = items.filter((item) => headlineIds.includes(item.id));
      console.log(
        `[generate-batch] using ${pickedHeadlines.length} picked headlines`
      );
    }

    // Unconsumed real-life notes for whichever scopes this batch covers.
    // Notes are not opt-in the way headlines are — everything waiting in the
    // pool is offered, and only what a post actually uses gets consumed.
    //
    // The filter and ordering match real_life_notes_unconsumed_idx exactly
    // (scope, note_date desc, where consumed = false), so this rides the
    // existing partial index.
    const noteScopes = scanScopesForBatch(scope) as NoteScope[];
    const { data: noteRows, error: notesError } = await supabase
      .from("real_life_notes")
      .select("id, content, note_date, scope")
      .in("scope", noteScopes)
      .eq("consumed", false)
      .order("note_date", { ascending: false });

    if (notesError) {
      // A notes failure must not sink the batch — headlines and evergreen
      // material still make a perfectly good batch. Say so and carry on.
      console.error("[generate-batch] notes fetch failed:", notesError);
    }

    // Cap per scope, after ordering, so each scope contributes its newest N
    // rather than one scope crowding the other out of a shared budget.
    const availableNotes = (noteRows || []) as RealLifeNote[];
    const notes: RealLifeNote[] = noteScopes.flatMap((noteScope) =>
      availableNotes
        .filter((note) => note.scope === noteScope)
        .slice(0, NOTES_PER_SCOPE[noteScope])
    );

    console.log(
      `[generate-batch] offering ${notes.length} notes ` +
        noteScopes
          .map(
            (s) => `${s}=${notes.filter((n) => n.scope === s).length}`
          )
          .join(" ")
    );

    const enabledPlatforms = parseEnabledPlatforms(settings.enabled_platforms);
    const guidance: GenerationGuidance = {
      contentNotes: settings.content_notes || "",
      bannedWords: settings.banned_words || "",
      speckIsms: settings.speck_isms || "",
      styleSamples: settings.style_samples || "",
      headlines: pickedHeadlines,
      notes,
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

    // 5. Trim to the requested size. Notes-backed posts go first, then
    //    headline-backed, then evergreen — real and perishable material takes
    //    the low post numbers. The sort is stable, so within each group the
    //    interleave order stands and categories stay varied.
    const ordered = orderBySource(interleaved, notes, pickedHeadlines);
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

    // Resolve a post's 1-based note_index back to the note id it referred to,
    // using the same notesForCategory the prompt builder used so both sides
    // count the same list. Out of range or non-numeric means no note.
    const noteIdFor = (
      category: ContentCategory,
      post: GeneratedPost
    ): string | null => {
      const forCategory = notesForCategory(category, notes);
      const index = post.note_index;
      if (typeof index !== "number" || index < 1 || index > forCategory.length) {
        return null;
      }
      return forCategory[index - 1].id;
    };

    // A note may be claimed once per batch. Company notes are shown to all
    // five company categories, so two posts landing on the same note is the
    // expected case, not an anomaly — first post in final order keeps it.
    const claimedNoteIds = new Set<string>();
    const claimNote = (
      category: ContentCategory,
      post: GeneratedPost
    ): string | null => {
      const noteId = noteIdFor(category, post);
      if (!noteId || claimedNoteIds.has(noteId)) return null;
      claimedNoteIds.add(noteId);
      return noteId;
    };

    const postsToInsert = postsToSchedule.map((item, index) => {
      // Claimed in final order, which is the order this map runs in.
      const sourceNoteId = claimNote(item.category, item.post);
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
        source_note_id: sourceNoteId,
        // Notes are the primary material, so a post that kept a note claim
        // records no headline even if the model set both indexes. A post that
        // lost its claim to an earlier post falls back to its headline.
        ...(sourceNoteId
          ? { headline_source_url: null, headline_text: null }
          : headlineColumnsFor(item.category, item.post)),
      };
    });

    // 8. Insert all posts
    const { error: insertError } = await supabase
      .from("posts")
      .insert(postsToInsert)
      .select("id");

    if (insertError) {
      console.error("Post insertion error:", insertError);
      // Clean up the batch if posts fail. Notes are deliberately untouched on
      // this path — nothing landed, so they stay in the pool for next time.
      await supabase.from("batches").delete().eq("id", batch!.id);
      return NextResponse.json(
        { error: "Failed to save posts" },
        { status: 500 }
      );
    }

    // Consume on use, not on offer: only the notes a post actually claimed are
    // marked, so anything the model passed over comes back next batch. This
    // runs after the insert succeeded, so a failed batch consumes nothing.
    const usedNoteIds = Array.from(claimedNoteIds);
    if (usedNoteIds.length > 0) {
      const { error: consumeError } = await supabase
        .from("real_life_notes")
        .update({
          consumed: true,
          consumed_at: new Date().toISOString(),
          consumed_by_batch_id: batch!.id,
        })
        .in("id", usedNoteIds);

      if (consumeError) {
        // The batch is already saved and is the thing the user asked for.
        // A note left unconsumed just reappears next batch, which is a far
        // better failure than throwing away a batch that generated fine.
        console.error(
          "[generate-batch] failed to mark notes consumed:",
          consumeError
        );
      } else {
        console.log(
          `[generate-batch] consumed ${usedNoteIds.length} notes into batch ${batchNumber}`
        );
      }
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
