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

    // 1. Flip the company-approved flag for every post in the batch.
    const { error: flagError } = await supabase
      .from("posts")
      .update({ linkedin_company_approved: true })
      .eq("batch_id", params.id);

    if (flagError) {
      return NextResponse.json({ error: flagError.message }, { status: 500 });
    }

    // 2. Keep post.status in sync: any draft/edited post now has at least
    //    one approval flag true, so promote them to "approved". Leave
    //    scheduled/published rows alone — they're terminal-ish.
    const { error: statusError } = await supabase
      .from("posts")
      .update({ status: "approved" })
      .eq("batch_id", params.id)
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
