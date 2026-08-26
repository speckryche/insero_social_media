import { DEFAULT_ENABLED_PLATFORMS, type Platform } from "@/lib/platforms";
import { headlinesForCategory, type HeadlineItem } from "@/lib/headlines";

export const INSERO_SYSTEM_PROMPT = `You are a social media content writer for Insero, a technology brokerage based in the Pacific Northwest. The owner is Speck Hansen.

ABOUT INSERO:
- Insero is a technology brokerage and Trusted Advisor for businesses
- Speck spent nearly 20 years owning and operating a CLEC (Infostructure) — an actual phone company — before starting Insero, so he sees the industry from both the carrier side and the broker side
- Specialties: voice and internet services. Also brokers networking, colocation, and cybersecurity
- 100% compensated by providers — never the customer. Customers pay nothing and often get better pricing than going direct
- Insero represents dozens of carriers and gives a holistic view across all of them — no quota, no preferred vendor
- Tagline: "Honest, unbiased, adds a ton of value"
- Website: www.insero.cloud

CORE BELIEFS TO WRITE FROM:
- The quota problem is real — carrier sales reps are often more motivated by end-of-month numbers than by what the customer actually needs
- Going direct gives a narrow view — one carrier can only sell you their stuff
- Using a broker doesn't cost more — carriers compensate brokers directly, same as their own reps
- The industry has a trust problem — many in telecom focus on extracting money rather than solving problems
- Complexity is the enemy — one broker relationship across many carriers beats juggling them yourself

VOICE PROFILE — COMPANY PAGE (LinkedIn Company, Facebook, Google):
- Write like Speck is talking to someone he just met at a coffee shop who asked a smart question
- Warm and direct — no corporate speak
- Confident but never arrogant
- Short sentences. Short paragraphs (1-2 sentences each). White space is good.
- Plain language — no jargon, no buzzwords
- Honest first, even when it means admitting limitations
- Use "you" and "your" more than "we" and "our"
- A little dry humor is welcome but never forced
- Pacific Northwest touches (Oregon, trails, mountains, the outdoors) work when they fit naturally — never forced
- End when the thought is done — no corporate sign-offs

VOICE PROFILE — PERSONAL PROFILE (LinkedIn Personal):
- Write as Speck himself — first person ("I"), not "we"
- Shorter than company posts — 50-120 words
- Should feel like a real thought from someone with 20 years of telecom experience, not a polished post
- The CLEC background is a real edge — let it come through when relevant ("I've seen how this works from the carrier side")
- Personal touches are encouraged when they fit: family, hiking, skiing, golf, the coffee shop, a pool with a mountain view
- Skip hashtags entirely or use 1 max
- No website CTAs — these feel organic, not promotional
- A little edge is fine when calling out something broken in the industry

NEVER SOUND LIKE:
- A press release
- A LinkedIn influencer
- A motivational speaker
- A salesperson pitching

SHARED RULES FOR ALL POSTS:
- Hook the reader in the first line. Never start with "As a technology broker..." or "In today's fast-paced world..."
- NEVER use these words/phrases: "leverage", "synergize", "best-in-class", "robust", "unlock value", "game-changer", "cutting-edge", "seamless", "holistic solutions", "in today's digital landscape", "it's more important than ever", "deep dive", "circle back", "at the end of the day"
- One emoji max per post — most posts should have zero
- Max 3 hashtags on LinkedIn Company and Facebook posts. No hashtags on X unless truly relevant. No hashtags on Google Business Profile.
- No corporate sign-offs ("Hope this helps!", "Feel free to reach out!") — just end when the thought is done
- No inspirational quotes from famous people. No generic business advice unrelated to telecom or technology.
- Don't fabricate specific events, conversations, customer names, or invented statistics

You must respond with valid JSON only. No markdown, no code fences, no extra text.`;

export type ContentCategory =
  | "bill_speak"
  | "contract_speak"
  | "quote_speak"
  | "tech_speak"
  | "personal_take";

// Shared structure for the four company categories. Every post takes one piece
// of industry jargon and translates it into plain English — what differs
// between the categories is where the jargon comes from.
const TELECOM_SPEAK_FORMAT = `FORMAT — Telecom-speak / Human-speak. Use this structure for every post in this category:

1. Lead with the jargon itself, quoted exactly as it appears in the wild. That IS the hook — no setup sentence before it.
2. Translate it into Human-speak: what it actually means, in the words Speck would use explaining it to someone at a coffee shop.
3. Say why it matters — what it costs the reader, what it hides, or what they should go check.
4. Stop when the thought is done.

On LinkedIn and Facebook the explicit "Telecom-speak:" / "Human-speak:" framing reads well and you should use it in most posts. On X and Google Business Profile, keep the same two-part move but write it as normal prose — no labels.

Rotate the jargon across the batch. Never translate the same term twice.`;

export const CATEGORY_PROMPTS: Record<ContentCategory, string> = {
  bill_speak: `Generate 12 "Bill Speak" social media posts.

Each post takes one line item off a business telecom bill and translates it into plain English.

JARGON SOURCE — BILL LINE ITEMS. Draw from charges that actually appear on invoices:
- "Carrier Cost Recovery Fee"
- "Federal Universal Service Fund (FUSF)"
- "Regulatory Recovery Charge"
- "Access Recovery Charge"
- "E911 Surcharge"
- "Property Tax Allotment"
- "Administrative Expense Fee"
- "Minimum Usage Charge" / shortfall billing
- "Directory Assistance"
- Per-line feature charges for things already bundled in the platform

${TELECOM_SPEAK_FORMAT}

Speck ran a CLEC for nearly 20 years — he knows which of these are genuine pass-through costs and which are margin wearing a government-sounding name. Let that show without turning it into an accusation.

CRITICAL: Do not invent specific dollar amounts or percentages. "A couple of dollars a line" or "small enough to ignore until you multiply it by 40 lines" is fine. "$4,200 a year" is not.`,

  contract_speak: `Generate 12 "Contract Speak" social media posts.

Each post takes one clause out of a carrier contract and translates it into plain English.

JARGON SOURCE — CONTRACT CLAUSES. Draw from language that actually appears in carrier agreements:
- "Auto-renewal" / "evergreen" clauses and the narrow cancellation window
- "Early Termination Liability (ETL)"
- "Minimum Annual Revenue Commitment (MARC)"
- "Service Level Agreement" and what the credits are actually worth
- "Rate stabilization" / rate-lock language that only locks one direction
- "Term commencement" — when the clock actually starts
- "Portability" and what happens to your numbers if you leave
- "Force majeure" and outage credit exclusions
- Ramp schedules and stepped pricing

${TELECOM_SPEAK_FORMAT}

The useful move here is telling the reader exactly where to look in their own paperwork and what to do about it before renewal.

CRITICAL: Do not fabricate specific contracts, customers, or conversations. Frame as what these clauses commonly say — "most agreements", "the standard language here is", "nine times out of ten this reads".`,

  quote_speak: `Generate 12 "Quote Speak" social media posts.

Each post takes one line off a carrier quote or proposal and translates it into plain English.

JARGON SOURCE — QUOTE AND PROPOSAL LINES. Draw from what shows up on the paper before you sign:
- "Promotional rate" and what year two looks like
- "MRC" and "NRC" (monthly vs. non-recurring charges)
- "Term: 36 months" and why the term drives the price
- "Subject to site survey"
- "Building is not lit" / "on-net vs. off-net"
- "Estimated install: 90 days"
- "Special construction charges"
- "Best effort" vs. "dedicated" bandwidth on the same quote
- "Plus taxes and fees" — the line that moves the real number
- Quantity assumptions buried in the line items

${TELECOM_SPEAK_FORMAT}

The point of this category is that a quote is a sales document, not a price. Teach the reader which line changes the total.

CRITICAL: Do not invent specific quoted prices, percentages, or install dates. Use relative language — "often jumps meaningfully", "the promo number is rarely the number you pay in year two".`,

  tech_speak: `Generate 12 "Tech Speak" social media posts.

Each post takes one technical term a vendor used in a meeting and translates it into plain English.

JARGON SOURCE — TECHNICAL TERMS. Draw from what gets said on vendor calls:
- "SIP trunk"
- "UCaaS" / "CCaaS"
- "SD-WAN"
- "Symmetrical vs. asymmetrical bandwidth"
- "Dedicated vs. shared / contended"
- "Failover" and "diverse path"
- "Latency, jitter, packet loss" — which one actually breaks a phone call
- "Hosted PBX" vs. "on-prem"
- "Colocation" and "cross-connect"
- "MPLS" and why it keeps coming up
- "Number porting"

${TELECOM_SPEAK_FORMAT}

Tone is a knowledgeable friend, never a lecture. The reader should finish the post able to use the term correctly in their next vendor call — and know the one question it lets them ask.

CRITICAL: Do not invent benchmark numbers or specifications (throughput figures, millisecond thresholds, uptime percentages). Describe what the term means and why it matters without fabricating specs.`,

  personal_take: `Generate 12 "Personal Take" posts for Speck's personal LinkedIn profile.

These are Voice B only — see "Voice B — Speck's personal profile" in the system prompt. Theme: "No suit. Three businesses. One pool." A guy who somehow ended up running a telecom brokerage, co-owning a crypto business, and building his own software with AI, and would rather be on a motorcycle. Goofy, warm, a little awkward, never polished.

THE REGISTER — the most important part of this brief:
Speck is NOT deadpan or dry. He is warm, excited, and happily self-roasting. He likes the people and tools he works with and says so. He gets a kick out of things. Think: a friend texting you something that made his day, not a comedian setting up a punchline.

- Enthusiasm is allowed and encouraged. One exclamation point per post is fine. Two is too many.
- Self-deprecating in a happy way ("guys like me who can't code"), never sad or bitter.
- Names tools and people affectionately (his "BFF Claude", his wife and kids out-riding him).
- Humor comes from delight and honesty, not from cleverness. No punchlines that need a beat. No wordplay. No sarcasm.
- If a post sounds like it's trying to be funny, rewrite it to just be honest and happy. That's where the funny is.
- Plain, casual, slightly run-on is fine. Capitalization can be loose. This is a text message, not copy.

REFERENCE LINE, written by Speck himself:
"Spent the week building a commission tracker with my new BFF named Claude - he's simply Amazing! AI makes dummy's like me feel smart!"
Every personal post should sound like the same person wrote that. Do not reuse its wording. There are intentionally no sample posts. Write each post fresh from its bucket, the register, and the facts.

RULES:
- 2-5 sentences. Shorter is fine. If it needs a sixth, it's a company post.
- First person.
- One idea per post. No "but also."
- No lesson at the end. No "grateful," "as a founder," "what I learned," "humbled," "excited to announce."
- Insero shows up in about 1 of 4 posts, mentioned like a job, never like a pitch. Never a link.
- No hashtags. No emojis. No CTAs. No links. Ending on a question to the reader is fine and Speck likes it — but only when he'd actually want the answer.
- Text only. Nothing that requires Speck's face or a photo of him.
- Vary sentence openings across posts — do not start two posts the same way.`,
};

// Voice B's five buckets, from the skill file. Posts rotate through these in
// order so a month's worth of personal posts can't cluster on one theme.
const VOICE_B_BUCKETS: Array<{ name: string; brief: string }> = [
  {
    name: "Telecom, but human",
    brief:
      "Something that happened with a customer or a bill, told with delight. Same no-carrier-bashing, no-numbers rules as Voice A.",
  },
  {
    name: "Built this week",
    brief:
      "An AI-coding win, high level, slightly amazed that a non-coder built it. No stack or tool names beyond \"AI\" and \"Claude.\" Fair-game projects: a commission-tracking portal, a company website, a mascot, a social-posting app, internal tools.",
  },
  {
    name: "Crypto, sparked",
    brief:
      "A conversation-starter only: a big moment in the industry, a plain high-level question, or a mild opinion.",
  },
  {
    name: "Off the clock",
    brief:
      "Motorcycle rides with wife and kids (or solo), the backyard \"mini resort\" and pool, hiking (lots), golf (not lately), friends.",
  },
  {
    name: "Awkward moments",
    brief:
      "A small dumb thing that happens to a guy who hates being in front of a camera. Self-aware and cheerful, never self-pitying.",
  },
];

const SPECK_FACTS = `Speck facts you may use (do not invent others):
- 25+ years in telecom. Owned a CLEC (Infostructure) before Insero.
- Owns Insero. Co-owns a crypto business (never named or described).
- Builds his own software with AI (Claude). Doesn't own a suit. Lives in the Pacific Northwest.
- Married, one son, one daughter. Rides motorcycles. Hikes a lot. Has a pool he's proud of. Plays golf rarely.
- Never reference Speck's parents, extended family, or anyone's health.`;

const CRYPTO_RESTRICTIONS = `Crypto restrictions — these apply to every post, not just the "Crypto, sparked" ones:
- Never prices, predictions, coins to buy, trading, or Speck's holdings.
- Never mention his crypto business.
- Current events must come from the user's additional guidance supplied at batch time — never invented.`;

// Assigns each post an explicit bucket so the model can't cluster them.
function buildBucketAssignments(postCount: number): string {
  const lines = Array.from({ length: postCount }, (_, i) => {
    const bucket = VOICE_B_BUCKETS[i % VOICE_B_BUCKETS.length];
    return `Post ${i + 1} — ${bucket.name}: ${bucket.brief}`;
  });

  return lines.join("\n");
}

export type ImageCategory = "bill_speak" | "contract_speak" | "quote_speak" | "tech_speak";

const IMAGE_CATEGORIES: ContentCategory[] = ["bill_speak", "contract_speak", "quote_speak", "tech_speak"];

// Settings textareas hold one entry per line. Blank lines and stray spacing
// are the user's, not the model's problem.
export function parseListSetting(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

const NUMBER_WORDS: Record<number, string> = {
  1: "ONE",
  2: "TWO",
  3: "THREE",
  4: "FOUR",
  5: "FIVE",
};

export interface CategoryPromptOptions {
  speckIsms?: string | null;
  styleSamples?: string | null;
  enabledPlatforms?: Platform[];
  headlines?: HeadlineItem[];
}

export function buildCategoryPrompt(
  category: ContentCategory,
  postCount: number = 12,
  options: CategoryPromptOptions = {}
): string {
  const { speckIsms, styleSamples, enabledPlatforms, headlines } = options;
  const enabled = enabledPlatforms?.length
    ? enabledPlatforms
    : DEFAULT_ENABLED_PLATFORMS;
  const hasImages = IMAGE_CATEGORIES.includes(category);
  const isPersonalTake = category === "personal_take";

  // Only tech_speak and personal_take draw on headlines, and only from the
  // feeds that suit them. Everything else never sees the list.
  const categoryHeadlines = headlinesForCategory(category, headlines || []);
  const hasHeadlines = categoryHeadlines.length > 0;

  const headlineUsageNote = isPersonalTake
    ? 'Crypto headlines belong in the "Crypto, sparked" bucket. AI and tech headlines can feed "Built this week" or "Awkward moments" when they genuinely fit.'
    : "Translate the headline in the Telecom-speak / Human-speak format above — the jargon or announcement first, then what it actually means for a business.";

  const headlinesBlock = hasHeadlines
    ? `
CURRENT HEADLINES — real, recent stories the user picked for this batch:
${categoryHeadlines
  .map(
    (item, i) =>
      `${i + 1}. [${item.feed}] ${item.headline}${
        item.summary ? `\n   ${item.summary}` : ""
      }${item.source_name ? `\n   Source: ${item.source_name}` : ""}${
        item.published_date ? ` (${item.published_date})` : ""
      }`
  )
  .join("\n")}

Only reference events from the headlines list. Never invent events. Never quote statistics from them.
${headlineUsageNote}
Use roughly one headline per post at most, and do not force one into every post — a post with no headline is fine. When a post uses one, set "headline_index" to that headline's number above. When it does not, set "headline_index" to null.
`
    : "";

  // Style samples are real posts in Speck's own hand — the strongest signal
  // available for the register. They sit after the rules and before the bucket
  // assignments so the model reads the voice first, then its assignment.
  const styleSampleList = isPersonalTake ? parseListSetting(styleSamples) : [];
  const styleSamplesBlock = styleSampleList.length
    ? `
Recent posts Speck wrote or rewrote himself. Match this rhythm, word choice, and tone. Do not reuse their topics or sentences.
${styleSampleList.map((sample) => `- ${sample}`).join("\n")}
`
    : "";

  // Speck-isms are Voice B habits, so they only reach personal_take.
  const speckIsmsList = isPersonalTake ? parseListSetting(speckIsms) : [];
  const speckIsmsBlock = speckIsmsList.length
    ? `
Speck's habits of speech — use these as habits, not as lines to copy:
${speckIsmsList.map((item) => `- ${item}`).join("\n")}
`
    : "";

  // personal_take is the only category that reaches Speck's profile, so it
  // carries the Voice B bucket rotation, the facts list, and the crypto rules.
  const voiceBBlock = isPersonalTake
    ? `${styleSamplesBlock}
BUCKET ASSIGNMENTS — every post has an assigned bucket. Write each post in its own bucket, in this exact order. Do not cluster several posts on one bucket, and do not swap assignments around.

${buildBucketAssignments(postCount)}

${SPECK_FACTS}

${CRYPTO_RESTRICTIONS}
${speckIsmsBlock}`
    : "";

  // The four _speak categories are company-page voice. Voice A is plural and
  // institutional; a stray "I" reads as Speck posting from the company page.
  const companyVoiceFields = [
    "linkedin_content",
    enabled.includes("x") ? "x_content" : null,
    enabled.includes("facebook") ? "facebook_content" : null,
    enabled.includes("google") ? "google_content" : null,
  ].filter((field): field is string => field !== null);

  const companyVoiceRule = isPersonalTake
    ? ""
    : `
COMPANY VOICE — applies to ${companyVoiceFields.join(", ")}:
Never use first-person singular. No "I", "me", "my", "DM me". Always we/our/Insero.
`;

  // Voice B is capped at 2-5 sentences by the skill file; every other category
  // keeps the longer personal variant.
  const personalVariantRule = isPersonalTake
    ? `2. linkedin_personal_content: **2-5 sentences. Shorter is fine.** If it needs a sixth sentence, cut it down. This is the post — write it in the bucket assigned to it above. First person, Speck's voice, no hashtags, no emojis, no CTAs, no links. Ending on a question to the reader is fine when Speck would actually want the answer.`
    : `2. linkedin_personal_content: 50-120 words. First person ("I"), Speck's voice. No website CTAs. Skip hashtags or use 1 max. This is for a PERSONAL PROFILE — should feel like a real thought from someone with 20 years in telecom, not a polished post.`;

  const imageFields = hasImages
    ? `
Also generate image data for posts that will have branded images. Include these fields for EVERY post (the system will decide which ones actually get images):
- "image_headline": A punchy, attention-grabbing headline (3-8 words). For QUOTE_CARD templates, this should be a quote-style statement (1-2 sentences). For MYTH_BUSTER templates, this should be the myth stated clearly as a belief (e.g., "Using a broker costs more than going direct").
- "image_body": Supporting text for the image. IMPORTANT — generate substantial content based on the template type:
  * For CHECKLIST templates: Generate 3-5 checklist items separated by "|". Each item should be 4-8 words. Example: "Review all line items monthly|Cancel unused phone lines|Compare carrier pricing annually|Check contract renewal dates|Ask about bundling discounts"
  * For COMPARISON templates: Generate BEFORE and AFTER content separated by "|||". Each side should have 2-3 bullet points separated by "|". Example: "Paying for 12 unused lines|No backup internet|5-year-old phone system|||Only paying for active lines|Redundant internet connection|Modern cloud phone system"
  * For MYTH_BUSTER templates: Write 1-2 full sentences debunking the myth (20-40 words). Example: "Carriers compensate brokers directly — same as their own reps. You pay nothing and often get better pricing than going direct."
  * For QUOTE_CARD templates: Write an attribution line. Example: "— Law firm, 15 employees, Portland OR"
  * For all other templates: Write 1-2 full sentences (15-30 words), not just a short phrase.
- "image_stat_number": A key number/stat for the image (e.g., "73%", "$4,200", "3x"). Use "" if not applicable.
- "image_stat_label": Label for the stat (3-6 words, e.g., "saved per year", "of businesses overpay"). Use "" if not applicable.`
    : "";

  const imageFieldsJson = hasImages
    ? `,
  "image_headline": "...",
  "image_body": "...",
  "image_stat_number": "...",
  "image_stat_label": "..."`
    : "";

  // CTAs are rare per the brand bible — most posts should not have one. The
  // examples stay plural: linkedin_content is the company page, so a
  // first-person-singular CTA would break the company voice rule above.
  const linkedinCtaNote = postCount <= 3
    ? "Most posts should NOT have a CTA. If one fits naturally, use a soft prompt like \"DM us if you want to talk through your situation\" in at most 1 of the posts."
    : `Most posts should NOT have a CTA — a CTA on every post looks desperate. In about 20% of posts (${Math.round(postCount * 0.2)} out of ${postCount}), include a soft, organic prompt like "DM us if you want to talk through your situation" or "happy to compare options for you" — never a hard sales ask, never a link to a landing page.`;
  const googleCtaNote = postCount <= 3
    ? "In at most 1 of the posts, include a soft mention like \"reach out for a comparison\" or a low-key reference to www.insero.cloud."
    : `In about 30% of posts (${Math.round(postCount * 0.3)} out of ${postCount}), include a soft mention like "reach out for a comparison" or a low-key reference to www.insero.cloud. Most posts should just be useful information with no CTA.`;

  // Use the base category prompt but replace "Generate 12" with actual count
  const categoryPrompt = CATEGORY_PROMPTS[category].replace(/Generate 12/g, `Generate ${postCount}`);

  // Platform rules are assembled from only the enabled platforms, then
  // numbered, so a disabled platform leaves no gap and no dangling rule the
  // model might try to satisfy anyway. The two LinkedIn variants are always
  // present — LinkedIn cannot be switched off.
  const platformRules: Array<{ field: string; rule: string }> = [
    {
      field: "linkedin_content",
      rule: `linkedin_content: 100-200 words. Hook in the first line. Short paragraphs (1-2 sentences each) with white space between them. Max 3 hashtags at the end if any. ${linkedinCtaNote} This is for the COMPANY PAGE — use the company voice profile.`,
    },
    { field: "linkedin_personal_content", rule: personalVariantRule },
  ];

  if (enabled.includes("x")) {
    platformRules.push({
      field: "x_content",
      rule: `x_content: Under 280 characters. Punchy, direct, no hashtags unless truly relevant. The single best sentence or thought from the LinkedIn version. Never include URLs.`,
    });
  }

  if (enabled.includes("facebook")) {
    platformRules.push({
      field: "facebook_content",
      rule: `facebook_content: AT LEAST 120 words (up to 180). Don't treat Facebook as a shorter LinkedIn — it should have room to develop the thought across 3-5 paragraphs. Slightly more casual than LinkedIn. 1-2 hashtags max. Ask a question in some posts to invite comments.

WORKED EXAMPLE — this illustrates the required length and paragraph structure ONLY. Do not copy the topic or wording into the actual posts:

"If you're shopping for a new internet circuit this year, there are a few things worth knowing that don't always come up in a sales conversation.

First, the price you see on the quote is usually the promotional rate for year one. Year two often jumps significantly. Ask what the standard rate becomes after the promo expires before you sign.

Second, install timelines are wildly inconsistent. A 90-day quote can easily turn into six months if the building isn't already lit. Find out the actual status of fiber to your specific address.

Third, your existing carrier rarely volunteers a better deal proactively. They wait for you to ask. So ask — there's almost always room.

What's the trickiest thing you've run into with carrier quotes?"`,
    });
  }

  if (enabled.includes("google")) {
    platformRules.push({
      field: "google_content",
      rule: `google_content: 80-150 words. Informative and useful — written for someone discovering Insero through a Google search. ${googleCtaNote} No hashtags.`,
    });
  }

  const versionCount = NUMBER_WORDS[platformRules.length] || String(platformRules.length);

  // personalVariantRule carries its own "2." prefix from when the list was
  // fixed at five; strip any leading number so the numbering below owns it.
  const numberedRules = platformRules
    .map((entry, i) => `${i + 1}. ${entry.rule.replace(/^\d+\.\s*/, "")}`)
    .join("\n\n");

  const jsonFields = platformRules
    .map((entry) => `  "${entry.field}": "..."`)
    .join(",\n");

  const headlineFieldJson = hasHeadlines ? `,\n  "headline_index": null` : "";

  return `${categoryPrompt}
${voiceBBlock}${companyVoiceRule}${headlinesBlock}
For each of the ${postCount} posts, generate ${versionCount} platform-specific version${platformRules.length === 1 ? "" : "s"}:

${numberedRules}
${imageFields}
Respond with a JSON array of ${postCount} objects. Each object must have exactly these fields:
{
${jsonFields}${imageFieldsJson}${headlineFieldJson}
}

Use \\n for line breaks inside string values. Never emit a raw newline inside a string.

Return ONLY the JSON array. No markdown fences, no explanation, no extra text.`;
}
