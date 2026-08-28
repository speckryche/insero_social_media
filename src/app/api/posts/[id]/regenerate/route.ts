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

    let type = "all";
    try {
      const body = await request.json();
      if (body.type) type = body.type;
    } catch {
      // No body — regenerate all
    }

    // Get the current post to know its category and image fields
    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select("content_category, linkedin_image_url, image_template_type")
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

    if (type === "personal") {
      // Only regenerate linkedin_personal_content
      const message = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1000,
        output_config: { effort: "low" },
        system: INSERO_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Generate exactly 1 LinkedIn personal profile post in the "${category}" category.

Category description: ${categoryDescription}

Write a SHORT post (50-150 words) for a personal LinkedIn profile. Casual, first-person voice. No CTAs to website. Skip hashtags or use 1 max. Should feel like a quick thought from a telecom consultant.

Respond with a single JSON object with one field:
{ "linkedin_personal_content": "..." }

No markdown fences.`,
          },
        ],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") throw new Error("No text response");

      let jsonText = textBlock.text.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      const generated = JSON.parse(jsonText);

      const { data, error } = await supabase
        .from("posts")
        .update({
          linkedin_personal_content: generated.linkedin_personal_content,
          status: "draft",
        })
        .eq("id", params.id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }

    if (type === "company") {
      // Only regenerate linkedin_content (company)
      const message = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1000,
        output_config: { effort: "low" },
        system: INSERO_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Generate exactly 1 LinkedIn company page post in the "${category}" category.

Category description: ${categoryDescription}

Write a professional but conversational post (150-300 words) for a company LinkedIn page. Use line breaks for readability. 2-3 hashtags max. Optionally include a CTA to www.insero.cloud/audit.

Respond with a single JSON object with one field:
{ "linkedin_content": "..." }

No markdown fences.`,
          },
        ],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") throw new Error("No text response");

      let jsonText = textBlock.text.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      const generated = JSON.parse(jsonText);

      const { data, error } = await supabase
        .from("posts")
        .update({
          linkedin_content: generated.linkedin_content,
          status: "draft",
        })
        .eq("id", params.id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }

    // Default: regenerate all 5 fields
    // A post carries image copy when it has an image attached — the URL
    // column, not the retired has_image flag.
    const postHasImage = !!post.linkedin_image_url;

    const imageFields = postHasImage
      ? `\nAlso generate image data:\n- "image_headline": Short headline (max 8 words)\n- "image_body": Supporting text (max 15 words)\n- "image_stat_number": Key stat (e.g., "73%"). Use "" if not applicable.\n- "image_stat_label": Label for stat. Use "" if not applicable.`
      : "";

    const imageJson = postHasImage
      ? `,\n  "image_headline": "...",\n  "image_body": "...",\n  "image_stat_number": "...",\n  "image_stat_label": "..."`
      : "";

    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 3000,
      output_config: { effort: "low" },
      system: INSERO_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate exactly 1 social media post in the "${category}" category.

Category description: ${categoryDescription}

Generate FIVE platform-specific versions:

1. linkedin_content: 150-300 words. Professional but conversational. 2-3 hashtags max. For COMPANY PAGE. Optionally include a CTA to www.insero.cloud/audit.

2. linkedin_personal_content: 50-150 words. Casual, first-person voice. No CTAs to website. 1 hashtag max. For PERSONAL PROFILE.

3. x_content: Under 280 characters. Punchy, direct, no hashtags unless truly relevant. Never include URLs.

4. facebook_content: 100-200 words. Slightly more casual than LinkedIn. 1-2 hashtags max. Can ask questions.

5. google_content: 80-150 words. Informative and local-business focused. Optionally include a CTA to call (844) 252-3185 or visit www.insero.cloud. No hashtags.
${imageFields}
Respond with a single JSON object (not an array) with these fields:
{
  "linkedin_content": "...",
  "linkedin_personal_content": "...",
  "x_content": "...",
  "facebook_content": "...",
  "google_content": "..."${imageJson}
}

No markdown fences.`,
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = {
      linkedin_content: generated.linkedin_content,
      linkedin_personal_content: generated.linkedin_personal_content,
      x_content: generated.x_content,
      facebook_content: generated.facebook_content,
      google_content: generated.google_content,
      status: "draft",
    };

    if (postHasImage) {
      update.image_headline = generated.image_headline || null;
      update.image_body = generated.image_body || null;
      update.image_stat_number = generated.image_stat_number || null;
      update.image_stat_label = generated.image_stat_label || null;
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
