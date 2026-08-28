import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isNoteScope, isISODate } from "@/lib/notes";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// PATCH — edit one note's text, scope or date.
//
// Only the three fields the page can edit are read off the body; consumed,
// consumed_at and consumed_by_batch_id belong to whatever consumes a note
// during generation and are not writable from here.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();
    const body = await request.json().catch(() => ({}));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {};

    if (body.content !== undefined) {
      const content = String(body.content).trim();
      if (!content) {
        return NextResponse.json(
          { error: "A note needs some text." },
          { status: 400 }
        );
      }
      updates.content = content;
    }

    if (body.scope !== undefined) {
      if (!isNoteScope(body.scope)) {
        return NextResponse.json(
          { error: 'scope must be "company" or "personal"' },
          { status: 400 }
        );
      }
      updates.scope = body.scope;
    }

    if (body.noteDate !== undefined) {
      if (!isISODate(body.noteDate)) {
        return NextResponse.json(
          {
            error: `Invalid noteDate: ${JSON.stringify(body.noteDate)}. Expected YYYY-MM-DD.`,
          },
          { status: 400 }
        );
      }
      updates.note_date = body.noteDate;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update." },
        { status: 400 }
      );
    }

    const { data: note, error } = await supabase
      .from("real_life_notes")
      .update(updates)
      .eq("id", params.id)
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

// DELETE — remove one note for good.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();

    const { error } = await supabase
      .from("real_life_notes")
      .delete()
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
