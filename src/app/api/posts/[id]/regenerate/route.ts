import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  ContentCategory,
  CATEGORY_PROMPTS,
  buildCtaRule,
  GOOGLE_CTA,
} from "@/lib/prompts";
import { CONTENT_SKILL } from "@/lib/content-skill";

// The same voice definition batch generation uses. Regeneration used to carry
// its own older copy, which drifted: it encouraged personal-life material in
// Voice B, said 20 years where the skill says 25+, and allowed hashtags the
// skill bans. One definition now, with only the output contract differing —
// every path here returns a single JSON object, not the array a batch returns.
const REGENERATE_SYSTEM_PROMPT = `${CONTENT_SKILL}

You must respond with a single valid JSON object. No markdown, no code fences, no extra text.`;

// The same soft-close rule batch generation uses, phrased for one post. It
// replaced an "optionally include a CTA to www.insero.cloud/audit" instruction
// that contradicted the skill file twice over: Voice A never puts a link in the
// body, and "audit" is banned in visible copy.
const CTA_RULE = buildCtaRule(1);

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

    if (type === "personal") {
      // Only regenerate linkedin_personal_content
      const message = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1000,
        output_config: { effort: "low" },
        system: REGENERATE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Generate exactly 1 LinkedIn personal profile post in the "${category}" category.

Category description: ${categoryDescription}

Write a SHORT post (50-150 words) for a personal LinkedIn profile. Casual, first-person voice. No CTAs. No links. No hashtags. Should feel like a quick thought from a telecom consultant.

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
        system: REGENERATE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Generate exactly 1 LinkedIn company page post in the "${category}" category.

Category description: ${categoryDescription}

Write a professional but conversational post (150-300 words) for a company LinkedIn page. Use line breaks for readability. No hashtags. ${CTA_RULE}

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
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 3000,
      output_config: { effort: "low" },
      system: REGENERATE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate exactly 1 social media post in the "${category}" category.

Category description: ${categoryDescription}

Generate FIVE platform-specific versions:

1. linkedin_content: 150-300 words. Professional but conversational. No hashtags. For COMPANY PAGE. ${CTA_RULE}

2. linkedin_personal_content: 50-150 words. Casual, first-person voice. No CTAs. No links. No hashtags. For PERSONAL PROFILE.

3. x_content: Under 280 characters. Punchy, direct, no hashtags. Never include URLs.

4. facebook_content: 100-200 words. Slightly more casual than LinkedIn. No hashtags. Can ask questions.

5. google_content: 80-150 words. Informative and local-business focused. ${GOOGLE_CTA} No hashtags.
Respond with a single JSON object (not an array) with these fields:
{
  "linkedin_content": "...",
  "linkedin_personal_content": "...",
  "x_content": "...",
  "facebook_content": "...",
  "google_content": "..."
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
