import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  try {
    const supabase = getSupabase();
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // Active batch
    const { data: activeBatch } = await supabase
      .from("batches")
      .select("*")
      .eq("status", "active")
      .maybeSingle();

    // Active batch posts for progress
    let batchProgress = null;
    let calendarDays: Array<{
      date: string;
      morning: string | null;
      afternoon: string | null;
    }> = [];
    let failedPosts: Array<{ id: string; post_number: number; error_log: string }> = [];

    if (activeBatch) {
      const { data: posts } = await supabase
        .from("posts")
        .select("id, post_number, scheduled_date, time_slot, status, error_log")
        .eq("batch_id", activeBatch.id)
        .order("scheduled_date", { ascending: true });

      if (posts) {
        const published = posts.filter((p) => p.status === "published").length;
        const scheduled = posts.filter((p) => p.status === "scheduled").length;
        const failed = posts.filter((p) => p.status === "failed").length;

        batchProgress = {
          total: posts.length,
          published,
          scheduled,
          failed,
        };

        failedPosts = posts
          .filter((p) => p.status === "failed")
          .map((p) => ({
            id: p.id,
            post_number: p.post_number,
            error_log: p.error_log || "",
          }));

        // Build calendar data
        const dayMap = new Map<
          string,
          { morning: string | null; afternoon: string | null }
        >();
        for (const post of posts) {
          if (!dayMap.has(post.scheduled_date)) {
            dayMap.set(post.scheduled_date, {
              morning: null,
              afternoon: null,
            });
          }
          const day = dayMap.get(post.scheduled_date)!;
          if (post.time_slot === "morning") day.morning = post.status;
          if (post.time_slot === "afternoon") day.afternoon = post.status;
        }
        calendarDays = Array.from(dayMap.entries()).map(([date, slots]) => ({
          date,
          ...slots,
        }));
      }
    }

    // Next upcoming post
    let nextPost = null;
    if (activeBatch) {
      const { data: upcoming } = await supabase
        .from("posts")
        .select("post_number, scheduled_date, time_slot")
        .eq("batch_id", activeBatch.id)
        .eq("status", "scheduled")
        .gte("scheduled_date", today)
        .order("scheduled_date", { ascending: true })
        .order("post_number", { ascending: true })
        .limit(1)
        .maybeSingle();

      nextPost = upcoming;
    }

    // Stats
    const { count: publishedThisMonth } = await supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("status", "published")
      .gte("published_at", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);

    const { count: publishedAllTime } = await supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("status", "published");

    const { count: totalFailed } = await supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed");

    // Personal post stats for this month
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const { count: personalPostedThisMonth } = await supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("linkedin_personal_approved", true)
      .eq("linkedin_personal_published", true)
      .gte("scheduled_date", monthStart);

    const { count: personalTotalThisMonth } = await supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("linkedin_personal_approved", true)
      .gte("scheduled_date", monthStart);

    return NextResponse.json({
      activeBatch,
      batchProgress,
      calendarDays,
      failedPosts,
      nextPost,
      stats: {
        publishedThisMonth: publishedThisMonth || 0,
        publishedAllTime: publishedAllTime || 0,
        totalFailed: totalFailed || 0,
        personalPostedThisMonth: personalPostedThisMonth || 0,
        personalTotalThisMonth: personalTotalThisMonth || 0,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
