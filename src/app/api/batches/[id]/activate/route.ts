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

    if (batch.status !== "approved") {
      return NextResponse.json(
        { error: "Batch must be approved before activating" },
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
