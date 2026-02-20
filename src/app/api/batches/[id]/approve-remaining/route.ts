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

    // Approve only posts that are still draft or edited (both personal + company)
    const { error: postsError } = await supabase
      .from("posts")
      .update({
        status: "approved",
        linkedin_personal_approved: true,
        linkedin_company_approved: true,
      })
      .eq("batch_id", params.id)
      .in("status", ["draft", "edited"]);

    if (postsError) {
      return NextResponse.json({ error: postsError.message }, { status: 500 });
    }

    // Check if all posts are now approved
    const { count } = await supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", params.id)
      .neq("status", "approved");

    // If all approved, update batch status
    if (count === 0) {
      await supabase
        .from("batches")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", params.id);
    }

    // Return updated batch
    const { data } = await supabase
      .from("batches")
      .select("*")
      .eq("id", params.id)
      .single();

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
