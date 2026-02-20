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

    // Approve all posts in the batch (status + both LinkedIn approval flags)
    const { error: postsError } = await supabase
      .from("posts")
      .update({
        status: "approved",
        linkedin_personal_approved: true,
        linkedin_company_approved: true,
      })
      .eq("batch_id", params.id);

    if (postsError) {
      return NextResponse.json({ error: postsError.message }, { status: 500 });
    }

    // Update batch status to approved
    const { data, error: batchError } = await supabase
      .from("batches")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", params.id)
      .select()
      .single();

    if (batchError) {
      return NextResponse.json({ error: batchError.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
