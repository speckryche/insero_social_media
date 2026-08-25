import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();

    // 1. Flip the personal-approved flag — personal_take posts only. Those are
    //    the only ones that go on Speck's profile (skill file, Voice B — "How
    //    the profile is fed"); the other categories carry no personal variant.
    const { error: flagError } = await supabase
      .from("posts")
      .update({ linkedin_personal_approved: true })
      .eq("batch_id", params.id)
      .eq("content_category", "personal_take");

    if (flagError) {
      return NextResponse.json({ error: flagError.message }, { status: 500 });
    }

    // 2. Keep post.status in sync: any draft/edited post now has at least
    //    one approval flag true, so promote them to "approved". Leave
    //    scheduled/published rows alone — they're terminal-ish. Scoped to the
    //    same personal_take rows so nothing else is promoted without a flag.
    const { error: statusError } = await supabase
      .from("posts")
      .update({ status: "approved" })
      .eq("batch_id", params.id)
      .eq("content_category", "personal_take")
      .in("status", ["draft", "edited"]);

    if (statusError) {
      return NextResponse.json({ error: statusError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
