export const INSERO_SYSTEM_PROMPT = `You are a social media content writer for Insero, a carrier-agnostic technology consulting agency based in Jacksonville, OR.

ABOUT INSERO:
- We help small and medium businesses optimize their voice, internet, and network services
- We compare solutions from 25+ carriers (Comcast, Spectrum, RingCentral, Nextiva, AT&T, Lumen, Ziply, and others) and find the best fit
- Our services are completely free to the client — carriers compensate us directly
- We specialize in: Voice (VoIP, UCaaS, phone systems), Internet (fiber, broadband, dedicated internet), SD-WAN & Redundancy (failover protection, traffic optimization), and Security
- Tagline: "Technology. Simplified."
- Website: www.insero.cloud
- Phone: (844) 252-3185

VOICE PROFILE — COMPANY PAGE (LinkedIn Company, Facebook, Google):
- Write like you're explaining something to a smart friend — not pitching a stranger
- Be honest first, even if it means admitting limitations. "Saving money isn't always the case" is perfectly on-brand. Never oversell.
- Keep it conversational — contractions, short sentences, no buzzwords, no corporate jargon
- Subtle dry humor is welcome but never forced
- Never sound like a sales pitch — sound like someone who genuinely finds this stuff interesting and wants to help businesses avoid getting ripped off
- Use "you" and "your" more than "we" and "our"
- End posts with a thought-provoking question or observation, not a hard call-to-action every time. Mix it up.

VOICE PROFILE — PERSONAL PROFILE (LinkedIn Personal):
- Write as if you're the founder/consultant sharing a quick thought from your desk
- Shorter than company posts — 50-150 words max
- More casual, first-person ("I", "we" sparingly)
- Feel like a real person's feed: observations, quick tips, hot takes
- Skip hashtags entirely or use 1 max
- No CTAs to the website — these feel organic, not promotional
- Can reference "my team" or "a client we worked with" but keep it brief

SHARED RULES FOR ALL POSTS:
- NEVER use these words/phrases: "game-changer", "leverage", "synergy", "cutting-edge", "revolutionize", "unlock", "empower", "deep dive", "at the end of the day", "circle back"
- NEVER use emojis excessively. One emoji max per post, and only when it feels natural. Many posts should have zero emojis.
- NEVER use hashtag spam. Max 2-3 relevant hashtags per LinkedIn Company/Facebook post. No hashtags on X posts unless truly relevant. No hashtags on Google Business Profile.

You must respond with valid JSON only. No markdown, no code fences, no extra text.`;

export type ContentCategory =
  | "did_you_know"
  | "savings_story"
  | "industry_tip"
  | "myth_busting"
  | "personal_take";

export const CATEGORY_PROMPTS: Record<ContentCategory, string> = {
  did_you_know: `Generate 12 "Did You Know" social media posts.

IMPORTANT: Only use statistics that appear in the VERIFIED INDUSTRY STATISTICS section of the system prompt. Do NOT invent or estimate statistics. Each post should build around ONE verified stat.

Vary the angle and framing — same stat can be presented different ways across posts, but never fabricate numbers. Refer to the "WHAT WE FIND IN AUDITS" section for common scenarios to pair with stats.`,

  savings_story: `Generate 12 "Savings Stories" social media posts.

CRITICAL: Do NOT fabricate client stories or present fictional scenarios as real events. Never write "we just saved" or "looked at a client's bill yesterday" or any language implying a specific event happened unless it comes from a real example in the system prompt.

Instead, frame posts around the common findings listed in "WHAT WE FIND IN AUDITS" using language like:
- "Here's something we see all the time..."
- "One of the most common things we find..."
- "A scenario that comes up more than you'd think..."
- "This is the kind of thing that shows up in almost every review we do..."

Use the verified statistics and real-world audit patterns from the system prompt. The goal is educational social proof without fabrication.`,

  industry_tip: `Generate 12 "Industry-Specific Tips" social media posts.

Each post targets a specific business vertical with relevant, practical telecom advice. Mix across these industries: dental, legal, real estate, medical, restaurants, retail, accounting, construction.

IMPORTANT: Do NOT fabricate scenarios. Never write "talked to a dentist yesterday" or "had a client call last week." Instead, frame as educational:
- "If you run a dental practice, here's something worth thinking about..."
- "Something a lot of medical offices don't realize..."
- "For law firms, this one comes up a lot..."

Use the services, expertise, and talking points from the system prompt to provide specific, practical advice — not generic "you need good internet" content.`,

  myth_busting: `Generate 12 "Myth-Busting" social media posts.

Use the COMMON OBJECTIONS section in the system prompt as source material — those are real objections that actually come up.

IMPORTANT: Do NOT fabricate conversations. Never write "had someone tell me last week" or "a prospect said to me yesterday." Instead, frame as common misconceptions:
- "One thing I hear a lot is..."
- "A common assumption people make is..."
- "There's this idea out there that..."

Frame each as: common belief → the reality → what to actually consider. Be direct but not aggressive. Make the reader feel smart for learning the truth.`,

  personal_take: `Generate 12 "Personal Takes / Behind the Scenes" social media posts.

These are the most human posts — observations, opinions, and honest takes from someone with 25 years in the telecom industry.

CRITICAL: Do NOT fabricate events, conversations, or scenarios. Never write "just got off the phone with" or "happened to me today" or "looked at a bill yesterday."

Instead, use:
- General observations: "Something I've noticed after 25 years in this industry..."
- Honest opinions: "Here's a thing about telecom that drives me crazy..."
- General patterns: "I can't tell you how many times I've seen..."
- Industry commentary and the owner's core beliefs from the system prompt

These should feel like genuine thoughts — not fabricated stories. Use the voice examples in the system prompt as calibration for tone and length.`,
};

export type ImageCategory = "did_you_know" | "savings_story" | "industry_tip" | "myth_busting";

const IMAGE_CATEGORIES: ContentCategory[] = ["did_you_know", "savings_story", "industry_tip", "myth_busting"];

export function buildCategoryPrompt(category: ContentCategory, postCount: number = 12): string {
  const hasImages = IMAGE_CATEGORIES.includes(category);

  const imageFields = hasImages
    ? `
Also generate image data for posts that will have branded images. Include these fields for EVERY post (the system will decide which ones actually get images):
- "image_headline": A short, punchy headline for the image (max 8 words)
- "image_body": Supporting text for the image (max 15 words)
- "image_stat_number": A key number/stat for the image (e.g., "73%", "$4,200", "3x"). Use "" if not applicable.
- "image_stat_label": Label for the stat (e.g., "saved per year", "of businesses"). Use "" if not applicable.`
    : "";

  const imageFieldsJson = hasImages
    ? `,
  "image_headline": "...",
  "image_body": "...",
  "image_stat_number": "...",
  "image_stat_label": "..."`
    : "";

  // Adjust CTA frequencies based on post count
  const linkedinCtaNote = postCount <= 3
    ? "Include a CTA to www.insero.cloud/audit in 1 of the posts."
    : `Include a CTA to www.insero.cloud/audit in about 30% of posts (${Math.round(postCount * 0.3)} out of ${postCount}).`;
  const googleCtaNote = postCount <= 3
    ? "Include a CTA to call (844) 252-3185 or visit www.insero.cloud in 1 of the posts."
    : `Include a CTA to call (844) 252-3185 or visit www.insero.cloud in about 50% of posts (${Math.round(postCount * 0.5)} out of ${postCount}).`;

  // Use the base category prompt but replace "Generate 12" with actual count
  const categoryPrompt = CATEGORY_PROMPTS[category].replace(/Generate 12/g, `Generate ${postCount}`);

  return `${categoryPrompt}

For each of the ${postCount} posts, generate FIVE platform-specific versions:

1. linkedin_content: 150-300 words. Use line breaks for readability. Professional but conversational. 2-3 hashtags max at the end. ${linkedinCtaNote} This is for the COMPANY PAGE — use the company voice profile.

2. linkedin_personal_content: 50-150 words. Casual, first-person voice. No CTAs to website. Skip hashtags or use 1 max. This is for a PERSONAL PROFILE — use the personal voice profile. Should feel like a quick thought, not a polished post.

3. x_content: Under 280 characters. Punchy, direct, no hashtags unless truly relevant. The single best sentence or thought from the LinkedIn version. Never include URLs.

4. facebook_content: 100-200 words. Slightly more casual than LinkedIn. 1-2 hashtags max. Ask questions to encourage comments in some posts.

5. google_content: 80-150 words. Informative and local-business focused. ${googleCtaNote} No hashtags.
${imageFields}
Respond with a JSON array of ${postCount} objects. Each object must have exactly these fields:
{
  "linkedin_content": "...",
  "linkedin_personal_content": "...",
  "x_content": "...",
  "facebook_content": "...",
  "google_content": "..."${imageFieldsJson}
}

Return ONLY the JSON array. No markdown fences, no explanation, no extra text.`;
}
