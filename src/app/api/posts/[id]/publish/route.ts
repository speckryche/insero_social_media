import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { publishPost } from "@/lib/publishers";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Manual publish — bypasses the scheduler
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();

    const { data: post, error } = await supabase
      .from("posts")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.status === "published") {
      return NextResponse.json(
        { error: "Post already published" },
        { status: 400 }
      );
    }

    const result = await publishPost(post);

    // Re-fetch the updated post
    const { data: updated } = await supabase
      .from("posts")
      .select("*")
      .eq("id", params.id)
      .single();

    return NextResponse.json({
      post: updated,
      results: result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
