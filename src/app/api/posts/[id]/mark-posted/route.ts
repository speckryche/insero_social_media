import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type Scope = "company" | "personal";

function isScope(value: unknown): value is Scope {
  return value === "company" || value === "personal";
}

const PUBLISHED_COLUMN: Record<Scope, string> = {
  company: "linkedin_published",
  personal: "linkedin_personal_published",
};

const CONTENT_COLUMN: Record<Scope, string> = {
  company: "linkedin_content",
  personal: "linkedin_personal_content",
};

function hasContent(post: Record<string, unknown>, scope: Scope): boolean {
  return String(post[CONTENT_COLUMN[scope]] || "").trim().length > 0;
}

// Records that one scope went out on LinkedIn by hand, outside the app.
//
// Deliberately separate from /publish: nothing here calls a publisher or
// touches the LinkedIn API. It only records what already happened.
//
// No publish_logs row is written. That table has no column that can mark a
// row as a manual publish — platform and status are both locked by CHECK
// constraints — and adding one would be a schema change.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();

    const body = await request.json().catch(() => ({}));
    const scope = body.scope;
    // undo: true reverses a mis-click.
    const undo = body.undo === true;

    if (!isScope(scope)) {
      return NextResponse.json(
        { error: 'scope must be "company" or "personal"' },
        { status: 400 }
      );
    }

    const { data: post } = await supabase
      .from("posts")
      .select("*")
      .eq("id", params.id)
      .single();

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const other: Scope = scope === "company" ? "personal" : "company";
    const otherPublished = post[PUBLISHED_COLUMN[other]] === true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = { [PUBLISHED_COLUMN[scope]]: !undo };

    if (undo) {
      // With nothing published any more, the post goes back to where it was:
      // approved, and with no publish timestamp.
      if (!otherPublished) {
        update.published_at = null;
        if (post.status === "published") update.status = "approved";
      }
    } else {
      // The first scope to go out stamps the time; a second one leaves it.
      if (!post.published_at) {
        update.published_at = new Date().toISOString();
      }

      // Only call the whole post published once every scope that actually has
      // content has gone out. A company-only post is done on its own.
      const populated = (["company", "personal"] as Scope[]).filter((s) =>
        hasContent(post, s)
      );
      const allPublished =
        populated.length > 0 &&
        populated.every((s) =>
          s === scope ? true : post[PUBLISHED_COLUMN[s]] === true
        );
      if (allPublished) update.status = "published";
    }

    const { data: updated, error } = await supabase
      .from("posts")
      .update(update)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
