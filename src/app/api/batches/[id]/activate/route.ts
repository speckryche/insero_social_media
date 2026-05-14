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

    // Verify batch is approved
    const { data: batch, error: fetchError } = await supabase
      .from("batches")
      .select("status")
      .eq("id", params.id)
      .single();

    if (fetchError || !batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    // Activation is allowed from draft or approved. We only block the two
    // terminal-ish states: already active, or already completed.
    if (batch.status === "active" || batch.status === "completed") {
      return NextResponse.json(
        { error: `Batch is already ${batch.status}` },
        { status: 400 }
      );
    }

    // Set batch to active
    const { data, error } = await supabase
      .from("batches")
      .update({ status: "active" })
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Heal any rows where a per-platform approval flag is true but
    // post.status was left as draft/edited (older approval handler behavior).
    // Bring them up to "approved" so the next promotion step catches them.
    await supabase
      .from("posts")
      .update({ status: "approved" })
      .eq("batch_id", params.id)
      .in("status", ["draft", "edited"])
      .or("linkedin_personal_approved.eq.true,linkedin_company_approved.eq.true");

    // Set all approved posts to scheduled
    await supabase
      .from("posts")
      .update({ status: "scheduled" })
      .eq("batch_id", params.id)
      .eq("status", "approved");

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
