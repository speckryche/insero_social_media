import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { publishPost } from "@/lib/publishers";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export async function GET(request: NextRequest) {
  // Optional auth check for cron security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const now = new Date();
    const today = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const weekend = isWeekend(now);

    // 1. Find the active batch
    const { data: batch } = await supabase
      .from("batches")
      .select("id")
      .eq("status", "active")
      .single();

    if (!batch) {
      return NextResponse.json({
        message: "No active batch",
        published: 0,
      });
    }

    // 2. Get scheduling settings
    const { data: settings } = await supabase
      .from("app_settings")
      .select("*")
      .single();

    if (!settings) {
      return NextResponse.json(
        { error: "App settings not found" },
        { status: 500 }
      );
    }

    // Determine the target times for today
    const morningTime = weekend
      ? settings.weekend_morning_time
      : settings.weekday_morning_time;
    const afternoonTime = weekend
      ? settings.weekend_afternoon_time
      : settings.weekday_afternoon_time;

    // 3. Find posts scheduled for today.
    //
    // SCHEDULED PUBLISHING IS RETIRED, pending a new scheduling scheme.
    // Batches are a numbered list now and generation writes scheduled_date
    // as null, so this lookup matches nothing for any new batch — the cron
    // runs and reports "No posts due right now". Publishing happens by hand
    // via Publish Now on the batch page, which does not consult this column.
    //
    // The query is left exactly as it was so it starts working again the
    // moment something populates scheduled_date. Note the LinkedIn publisher
    // is separately broken on a retired API version (426), so this cron could
    // not have published today regardless of the week change.
    const { data: duePosts } = await supabase
      .from("posts")
      .select("*")
      .eq("batch_id", batch.id)
      .eq("scheduled_date", today)
      .in("status", ["scheduled", "approved"]);

    if (!duePosts || duePosts.length === 0) {
      return NextResponse.json({
        message: "No posts due right now",
        published: 0,
      });
    }

    // 4. Filter to posts within the 15-minute window
    const postsToPublish = duePosts.filter((post) => {
      const targetTime =
        post.time_slot === "morning" ? morningTime : afternoonTime;
      const targetMinutes = timeToMinutes(targetTime);

      // Within 15 minutes of scheduled time
      return (
        currentMinutes >= targetMinutes &&
        currentMinutes < targetMinutes + 15 &&
        !post.linkedin_published &&
        !post.x_published &&
        !post.facebook_published &&
        !post.google_published
      );
    });

    if (postsToPublish.length === 0) {
      return NextResponse.json({
        message: "No posts in the current time window",
        published: 0,
      });
    }

    // 5. Publish each post via the LinkedIn-only flow.
    // publishPost now respects per-platform approval flags directly. We
    // preserve the cron-level `auto_publish_personal` gate by masking the
    // personal flag to false when the global setting is off — that way
    // approved personal posts can still surface on the Ready-to-Post page
    // for manual sharing instead of being auto-published.
    const autoPublishPersonal = settings.auto_publish_personal || false;
    const results = [];

    for (const post of postsToPublish) {
      const postForPublish = autoPublishPersonal
        ? post
        : { ...post, linkedin_personal_approved: false };

      const result = await publishPost(postForPublish);

      results.push({
        postNumber: post.post_number,
        timeSlot: post.time_slot,
        linkedin: result.linkedin?.success ?? null,
        linkedin_personal: result.linkedin_personal?.success ?? null,
      });
    }

    // 6. Check if all posts in the batch are now published
    const { count: unpublishedCount } = await supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", batch.id)
      .neq("status", "published");

    if (unpublishedCount === 0) {
      await supabase
        .from("batches")
        .update({ status: "completed" })
        .eq("id", batch.id);
    }

    return NextResponse.json({
      message: `Published ${results.length} post(s)`,
      published: results.length,
      results,
    });
  } catch (error) {
    console.error("Publish cron error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
