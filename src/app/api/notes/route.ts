import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isNoteScope, isISODate } from "@/lib/notes";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET — every note, newest first. The list is small and the page filters
// client-side, so there is no pagination here yet.
export async function GET() {
  try {
    const supabase = getSupabase();

    const { data: notes, error } = await supabase
      .from("real_life_notes")
      .select(
        `
        *,
        batches:consumed_by_batch_id (
          batch_number
        )
      `
      )
      .order("note_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(notes);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// POST — add one note.
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await request.json().catch(() => ({}));

    const content = String(body.content ?? "").trim();
    if (!content) {
      return NextResponse.json(
        { error: "A note needs some text." },
        { status: 400 }
      );
    }

    if (!isNoteScope(body.scope)) {
      return NextResponse.json(
        { error: 'scope must be "company" or "personal"' },
        { status: 400 }
      );
    }

    // An absent date means today, which is what the column defaults to.
    if (body.noteDate !== undefined && !isISODate(body.noteDate)) {
      return NextResponse.json(
        {
          error: `Invalid noteDate: ${JSON.stringify(body.noteDate)}. Expected YYYY-MM-DD.`,
        },
        { status: 400 }
      );
    }

    const { data: note, error } = await supabase
      .from("real_life_notes")
      .insert({
        content,
        scope: body.scope,
        ...(body.noteDate ? { note_date: body.noteDate } : {}),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(note);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
