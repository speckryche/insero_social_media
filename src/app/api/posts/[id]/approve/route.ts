import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Toggle approve/unapprove a single post
// Accepts optional { type: "personal" | "company" } in request body
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();

    let type: string | undefined;
    try {
      const body = await request.json();
      type = body.type;
    } catch {
      // No body or invalid JSON — treat as full post toggle
    }

    if (type === "personal") {
      // Toggle linkedin_personal_approved AND keep post.status in sync with
      // the per-platform flags so the approval counter and Activate gate
      // reflect this approval.
      const { data: post } = await supabase
        .from("posts")
        .select("linkedin_personal_approved, linkedin_company_approved, status")
        .eq("id", params.id)
        .single();

      if (!post) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }

      const newPersonal = !post.linkedin_personal_approved;
      const anyApproved = newPersonal || post.linkedin_company_approved;
      // Don't demote terminal states; otherwise the post's status follows
      // whether at least one platform flag is true.
      const isTerminal = post.status === "scheduled" || post.status === "published";
      const newStatus = isTerminal
        ? post.status
        : anyApproved
        ? "approved"
        : "draft";

      const { data, error } = await supabase
        .from("posts")
        .update({
          linkedin_personal_approved: newPersonal,
          status: newStatus,
        })
        .eq("id", params.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data);
    }

    if (type === "company") {
      // Toggle linkedin_company_approved AND keep post.status in sync.
      const { data: post } = await supabase
        .from("posts")
        .select("linkedin_personal_approved, linkedin_company_approved, status")
        .eq("id", params.id)
        .single();

      if (!post) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }

      const newCompany = !post.linkedin_company_approved;
      const anyApproved = post.linkedin_personal_approved || newCompany;
      const isTerminal = post.status === "scheduled" || post.status === "published";
      const newStatus = isTerminal
        ? post.status
        : anyApproved
        ? "approved"
        : "draft";

      const { data, error } = await supabase
        .from("posts")
        .update({
          linkedin_company_approved: newCompany,
          status: newStatus,
        })
        .eq("id", params.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data);
    }

    // Default: toggle full post status (existing behavior)
    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select("status")
      .eq("id", params.id)
      .single();

    if (fetchError || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const newStatus = post.status === "approved" ? "draft" : "approved";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = { status: newStatus };
    if (newStatus === "approved") {
      update.linkedin_personal_approved = true;
      update.linkedin_company_approved = true;
    }

    const { data, error } = await supabase
      .from("posts")
      .update(update)
      .eq("id", params.id)
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
