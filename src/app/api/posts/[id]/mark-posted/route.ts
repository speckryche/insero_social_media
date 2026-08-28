import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isFutureDate, isoDateToTimestamp } from "@/lib/post-status";
import { isISODate } from "@/lib/notes";

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

// publish_logs.platform is CHECK-constrained to the four platform names, so
// both scopes log as "linkedin" — the same folding publishPost does. The
// scope column is what tells the two destinations apart.
const LOG_PLATFORM = "linkedin";

function hasContent(post: Record<string, unknown>, scope: Scope): boolean {
  return String(post[CONTENT_COLUMN[scope]] || "").trim().length > 0;
}

// Records that one scope went out on LinkedIn by hand, outside the app.
//
// Deliberately separate from /publish: nothing here calls a publisher or
// touches the LinkedIn API. It only records what already happened.
//
// A publish_logs row is written alongside, with source "manual" so the
// Publish Log can tell a hand-posted entry from one the API produced. Undo
// removes that row again rather than leaving a record of something reversed.
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

    // The day it actually goes live on LinkedIn. A future date is normal —
    // posts are queued in LinkedIn's own scheduler — so it is not validated
    // against today.
    if (body.postedOn !== undefined && !isISODate(body.postedOn)) {
      return NextResponse.json(
        {
          error: `Invalid postedOn: ${JSON.stringify(body.postedOn)}. Expected YYYY-MM-DD.`,
        },
        { status: 400 }
      );
    }

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
        if (post.status === "published" || post.status === "scheduled") {
          update.status = "approved";
        }
      }
    } else {
      // The chosen date wins outright, rather than only filling a blank: the
      // second scope may go out later than the first, and the post is not live
      // until the last one has.
      const chosenAt = body.postedOn
        ? isoDateToTimestamp(body.postedOn)
        : new Date().toISOString();

      // Keep whichever date is later — the post goes live when its last scope
      // does, so that is the date the whole post is measured against.
      const existing = post.published_at ? new Date(post.published_at) : null;
      const chosen = new Date(chosenAt);
      update.published_at =
        existing && existing.getTime() > chosen.getTime()
          ? post.published_at
          : chosenAt;

      // Only call the whole post done once every scope that actually has
      // content has been marked. A company-only post is done on its own.
      const populated = (["company", "personal"] as Scope[]).filter((s) =>
        hasContent(post, s)
      );
      const allMarked =
        populated.length > 0 &&
        populated.every((s) =>
          s === scope ? true : post[PUBLISHED_COLUMN[s]] === true
        );

      // Still ahead of us means queued in LinkedIn, not live: "scheduled".
      if (allMarked) {
        update.status = isFutureDate(update.published_at)
          ? "scheduled"
          : "published";
      }
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

    // Keep the Publish Log in step. A logging failure must not fail the call —
    // the post row is already correct, which is what the UI reads.
    if (undo) {
      const { error: deleteError } = await supabase
        .from("publish_logs")
        .delete()
        .eq("post_id", params.id)
        .eq("source", "manual")
        .eq("scope", scope);
      if (deleteError) {
        console.error("[mark-posted] could not remove log row:", deleteError);
      }
    } else {
      const { error: logError } = await supabase.from("publish_logs").insert({
        post_id: params.id,
        platform: LOG_PLATFORM,
        scope,
        status: "success",
        source: "manual",
        // Nothing came back from an API — the post was shared by hand.
        post_id_returned: null,
        error_message: null,
      });
      if (logError) {
        console.error("[mark-posted] could not write log row:", logError);
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
