import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { INSERO_SYSTEM_PROMPT, ContentCategory, CATEGORY_PROMPTS } from "@/lib/prompts";

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

    // Get the current post to know its category
    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select("content_category")
      .eq("id", params.id)
      .single();

    if (fetchError || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const category = post.content_category as ContentCategory;
    const categoryDescription = CATEGORY_PROMPTS[category];

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: INSERO_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate exactly 1 social media post in the "${category}" category.

Category description: ${categoryDescription}

Generate FOUR platform-specific versions:

1. linkedin_content: 150-300 words. Use line breaks for readability. Professional but conversational. 2-3 hashtags max at the end. Optionally include a CTA to www.insero.cloud/audit.

2. x_content: Under 280 characters. Punchy, direct, no hashtags unless truly relevant. Never include URLs.

3. facebook_content: 100-200 words. Slightly more casual than LinkedIn. 1-2 hashtags max. Can ask questions.

4. google_content: 80-150 words. Informative and local-business focused. Optionally include a CTA to call (844) 252-3185 or visit www.insero.cloud. No hashtags.

Respond with a single JSON object (not an array) with these four fields. No markdown fences.`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from AI");
    }

    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const generated = JSON.parse(jsonText);

    // Update the post with new content
    const { data, error } = await supabase
      .from("posts")
      .update({
        linkedin_content: generated.linkedin_content,
        x_content: generated.x_content,
        facebook_content: generated.facebook_content,
        google_content: generated.google_content,
        status: "draft",
      })
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
