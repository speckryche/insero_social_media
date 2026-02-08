import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Deactivate (pause) an active batch
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();

    const { data: batch } = await supabase
      .from("batches")
      .select("status")
      .eq("id", params.id)
      .single();

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    if (batch.status !== "active") {
      return NextResponse.json(
        { error: "Only active batches can be paused" },
        { status: 400 }
      );
    }

    // Set batch back to approved (paused)
    const { data } = await supabase
      .from("batches")
      .update({ status: "approved" })
      .eq("id", params.id)
      .select()
      .single();

    // Set scheduled posts back to approved
    await supabase
      .from("posts")
      .update({ status: "approved" })
      .eq("batch_id", params.id)
      .eq("status", "scheduled");

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
