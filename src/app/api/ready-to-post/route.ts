import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET: returns posts where linkedin_personal_approved = true from active batch
export async function GET() {
  try {
    const supabase = getSupabase();

    // Find the active batch
    const { data: batch } = await supabase
      .from("batches")
      .select("id")
      .eq("status", "active")
      .maybeSingle();

    if (!batch) {
      return NextResponse.json({ posts: [], stats: { posted: 0, total: 0 } });
    }

    const { data: posts, error } = await supabase
      .from("posts")
      .select("id, post_number, scheduled_date, time_slot, content_category, linkedin_personal_content, linkedin_personal_approved, linkedin_personal_published, linkedin_personal_image_url")
      .eq("batch_id", batch.id)
      .eq("linkedin_personal_approved", true)
      .order("scheduled_date", { ascending: true })
      .order("post_number", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = posts?.length || 0;
    const posted = posts?.filter((p) => p.linkedin_personal_published).length || 0;

    return NextResponse.json({
      posts: posts || [],
      stats: { posted, total },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// POST: mark a personal post as posted
export async function POST(request: NextRequest) {
  try {
    const { postId } = await request.json();

    if (!postId) {
      return NextResponse.json({ error: "postId required" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("posts")
      .update({ linkedin_personal_published: true })
      .eq("id", postId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
