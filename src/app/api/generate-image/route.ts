import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generatePostImage, PLATFORM_SIZES, type ImageTemplateType } from "@/lib/image-generator";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const {
      postId,
      templateType,
      headline,
      bodyText,
      statNumber,
      statLabel,
      category,
      platform,
    } = await request.json();

    if (!postId || !templateType || !headline || !platform) {
      return NextResponse.json(
        { error: "Missing required fields: postId, templateType, headline, platform" },
        { status: 400 }
      );
    }

    const size = PLATFORM_SIZES[platform];
    if (!size) {
      return NextResponse.json(
        { error: `Unknown platform: ${platform}` },
        { status: 400 }
      );
    }

    // Generate the image
    const pngBuffer = await generatePostImage({
      templateType: templateType as ImageTemplateType,
      headline,
      bodyText: bodyText || "",
      statNumber,
      statLabel,
      category,
      width: size.width,
      height: size.height,
    });

    const supabase = getSupabase();

    // Upload to Supabase Storage
    const fileName = `${postId}/${platform}-${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("post-images")
      .upload(fileName, pngBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Image upload error:", uploadError);
      return NextResponse.json(
        { error: `Failed to upload image: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("post-images")
      .getPublicUrl(fileName);

    const imageUrl = urlData.publicUrl;

    // Determine which column to update based on platform
    const columnMap: Record<string, string> = {
      linkedin: "linkedin_image_url",
      x: "x_image_url",
      facebook: "facebook_image_url",
      google: "google_image_url",
      linkedin_personal: "linkedin_personal_image_url",
    };

    const column = columnMap[platform];
    if (column) {
      await supabase
        .from("posts")
        .update({ [column]: imageUrl })
        .eq("id", postId);
    }

    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("Image generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
