import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Uploads run through the server rather than straight from the browser:
// storage.objects has no RLS policies, so the anon key cannot write to the
// bucket. The service-role key bypasses RLS, which is how every other upload
// in this app already works.
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const BUCKET = "post-images";

// Route files may only export route handlers and Next's config fields.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

// Every extension an object for this scope could have been stored under, so a
// PNG replacing a JPG doesn't leave the JPG behind.
const ALL_EXTENSIONS = ["png", "jpg", "jpeg"];

type Scope = "company" | "personal";

const COLUMN_BY_SCOPE: Record<Scope, string> = {
  company: "linkedin_image_url",
  personal: "linkedin_personal_image_url",
};

function isScope(value: unknown): value is Scope {
  return value === "company" || value === "personal";
}

function objectPath(batchId: string, postId: string, scope: Scope, ext: string) {
  return `${batchId}/${postId}-${scope}.${ext}`;
}

// POST — multipart upload of one image for one scope.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();

    const form = await request.formData();
    const scope = form.get("scope");
    const file = form.get("file");

    if (!isScope(scope)) {
      return NextResponse.json(
        { error: 'scope must be "company" or "personal"' },
        { status: 400 }
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // The browser checks these too; repeated here because the browser is not
    // the only thing that can call this route.
    const ext = EXTENSION_BY_TYPE[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: "Only PNG and JPG images are accepted." },
        { status: 400 }
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Images must be 20 MB or smaller." },
        { status: 400 }
      );
    }

    const { data: post } = await supabase
      .from("posts")
      .select("id, batch_id")
      .eq("id", params.id)
      .single();

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const path = objectPath(post.batch_id, post.id, scope, ext);

    // Clear any object this scope was previously stored under with a different
    // extension. upsert handles the same-extension case on its own.
    const stale = ALL_EXTENSIONS.map((e) =>
      objectPath(post.batch_id, post.id, scope, e)
    ).filter((p) => p !== path);
    if (stale.length > 0) {
      await supabase.storage.from(BUCKET).remove(stale);
    }

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: true });

    if (uploadError) {
      console.error("[post-image] upload failed:", uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    // The path is stable across replacements, so without a cache-buster the
    // browser keeps showing the image that was just replaced.
    const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    const { data: updated, error } = await supabase
      .from("posts")
      .update({ [COLUMN_BY_SCOPE[scope]]: publicUrl })
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

// DELETE — drop one scope's image from storage and null its column.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();

    const body = await request.json().catch(() => ({}));
    const scope = body.scope;

    if (!isScope(scope)) {
      return NextResponse.json(
        { error: 'scope must be "company" or "personal"' },
        { status: 400 }
      );
    }

    const { data: post } = await supabase
      .from("posts")
      .select("id, batch_id")
      .eq("id", params.id)
      .single();

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Remove every extension this scope could be stored under. A miss is not
    // an error — the column is what the UI reads, and it is cleared either way.
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove(
        ALL_EXTENSIONS.map((e) => objectPath(post.batch_id, post.id, scope, e))
      );
    if (removeError) {
      console.error("[post-image] remove failed:", removeError);
    }

    const { data: updated, error } = await supabase
      .from("posts")
      .update({ [COLUMN_BY_SCOPE[scope]]: null })
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
