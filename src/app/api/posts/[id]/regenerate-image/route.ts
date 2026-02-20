import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generatePostImage, PLATFORM_SIZES, type ImageTemplateType } from "@/lib/image-generator";

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

    // Get the post with image data
    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select("id, has_image, image_template_type, image_headline, image_body, image_stat_number, image_stat_label, content_category")
      .eq("id", params.id)
      .single();

    if (fetchError || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (!post.has_image || !post.image_template_type) {
      return NextResponse.json({ error: "Post has no image" }, { status: 400 });
    }

    const platforms = ["linkedin", "x", "facebook", "google", "linkedin_personal"];
    const columnMap: Record<string, string> = {
      linkedin: "linkedin_image_url",
      x: "x_image_url",
      facebook: "facebook_image_url",
      google: "google_image_url",
      linkedin_personal: "linkedin_personal_image_url",
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageUpdates: Record<string, any> = {};

    for (const platform of platforms) {
      const platformKey = platform === "linkedin_personal" ? "linkedin" : platform;
      const size = PLATFORM_SIZES[platformKey];
      if (!size) continue;

      try {
        const pngBuffer = generatePostImage({
          templateType: post.image_template_type as ImageTemplateType,
          headline: post.image_headline || "",
          bodyText: post.image_body || "",
          statNumber: post.image_stat_number || undefined,
          statLabel: post.image_stat_label || undefined,
          category: post.content_category,
          width: size.width,
          height: size.height,
        });

        const fileName = `${post.id}/${platform}-${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
          .from("post-images")
          .upload(fileName, pngBuffer, {
            contentType: "image/png",
            upsert: true,
          });

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from("post-images")
            .getPublicUrl(fileName);

          const column = columnMap[platform];
          if (column) {
            imageUpdates[column] = urlData.publicUrl;
          }
        }
      } catch (err) {
        console.error(`Image regeneration failed for platform ${platform}:`, err);
      }
    }

    // Update the post with new image URLs
    if (Object.keys(imageUpdates).length > 0) {
      await supabase
        .from("posts")
        .update(imageUpdates)
        .eq("id", params.id);
    }

    // Return updated post
    const { data: updatedPost } = await supabase
      .from("posts")
      .select("*")
      .eq("id", params.id)
      .single();

    return NextResponse.json(updatedPost);
  } catch (error) {
    console.error("Image regeneration error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
