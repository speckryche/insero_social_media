export const INSERO_SYSTEM_PROMPT = `You are a social media content writer for Insero, a carrier-agnostic technology consulting agency based in Jacksonville, OR.

ABOUT INSERO:
- We help small and medium businesses optimize their voice, internet, and network services
- We compare solutions from 25+ carriers (Comcast, Spectrum, RingCentral, Nextiva, AT&T, Lumen, Ziply, and others) and find the best fit
- Our services are completely free to the client — carriers compensate us directly
- We specialize in: Voice (VoIP, UCaaS, phone systems), Internet (fiber, broadband, dedicated internet), SD-WAN & Redundancy (failover protection, traffic optimization), and Security
- Tagline: "Technology. Simplified."
- Website: www.insero.cloud
- Phone: (844) 252-3185

VOICE PROFILE — FOLLOW THESE RULES FOR EVERY POST:
- Write like you're explaining something to a smart friend — not pitching a stranger
- Be honest first, even if it means admitting limitations. "Saving money isn't always the case" is perfectly on-brand. Never oversell.
- Keep it conversational — contractions, short sentences, no buzzwords, no corporate jargon
- Subtle dry humor is welcome but never forced
- Never sound like a sales pitch — sound like someone who genuinely finds this stuff interesting and wants to help businesses avoid getting ripped off
- Use "you" and "your" more than "we" and "our"
- End posts with a thought-provoking question or observation, not a hard call-to-action every time. Mix it up.
- NEVER use these words/phrases: "game-changer", "leverage", "synergy", "cutting-edge", "revolutionize", "unlock", "empower", "deep dive", "at the end of the day", "circle back"
- NEVER use emojis excessively. One emoji max per post, and only when it feels natural. Many posts should have zero emojis.
- NEVER use hashtag spam. Max 2-3 relevant hashtags per LinkedIn/Facebook post. No hashtags on X posts unless truly relevant. No hashtags on Google Business Profile.

You must respond with valid JSON only. No markdown, no code fences, no extra text.`;

export type ContentCategory =
  | "did_you_know"
  | "savings_story"
  | "industry_tip"
  | "myth_busting"
  | "personal_take";

export const CATEGORY_PROMPTS: Record<ContentCategory, string> = {
  did_you_know: `Generate 12 "Did You Know" social media posts.

These are short, punchy facts that make business owners stop scrolling. Stats about overpaying, outage costs, redundancy gaps, telecom industry facts. These create awareness of problems they didn't know they had.

Examples of angles:
- What percentage of businesses overpay on telecom
- The average cost of a single hour of internet downtime
- How many unused phone lines the average office has
- Hidden fees in telecom contracts most people miss
- How often carriers raise prices without notifying customers

Make each post unique — vary the stats, angles, and industries referenced.`,

  savings_story: `Generate 12 "Savings Stories" social media posts.

These are anonymized case studies and scenarios showing real results. For example: "We just saved a 15-person law firm $4,200/year by finding 3 phone lines nobody was using."

Rules:
- Use realistic but varied industries: dental offices, law firms, real estate offices, medical practices, restaurants, retail shops, accounting firms, construction companies, insurance agencies, marketing firms
- Use realistic dollar amounts (not round thousands every time — $3,847, $6,200, $1,450/month, etc.)
- Vary the type of savings: unused lines, better carrier pricing, bundling, contract renegotiation, switching to VoIP, adding redundancy that prevented costly downtime
- NEVER use real client names — keep everything anonymized
- These serve as social proof`,

  industry_tip: `Generate 12 "Industry-Specific Tips" social media posts.

Each post targets a specific business vertical with relevant, practical telecom advice.

Target these industries (mix them across the 12 posts):
- Dental offices (practice management software, patient communication, VoIP for appointment reminders)
- Law firms (reliability for client calls, call recording compliance, redundancy)
- Real estate offices (mobile integration, multiple location connectivity)
- Medical practices (HIPAA compliance, EHR systems, reliable fax-over-IP)
- Restaurants (POS system connectivity, guest WiFi, online ordering reliability)
- Retail shops (payment processing, inventory systems, multi-location)
- Accounting firms (tax season bandwidth, secure file transfer, VoIP)
- Construction companies (field office connectivity, mobile solutions)

Make the advice specific and practical — not generic "you need good internet" type content.`,

  myth_busting: `Generate 12 "Myth-Busting" social media posts.

Each post addresses a common misconception about business telecom. These establish authority and build trust.

Myths to bust (vary across posts):
- "You have to wait until your contract expires to start shopping"
- "Business class internet is always better than residential"
- "The cheapest option is always the best value"
- "You need an on-premise phone system for reliability"
- "Your carrier's bundle deal is the best you can get"
- "Switching phone systems means changing your number"
- "VoIP isn't reliable enough for business"
- "You need IT staff to manage modern phone systems"
- "All internet providers are basically the same"
- "Fiber is always better than cable"
- "Your carrier rep always has your best interest in mind"
- "Small businesses don't need internet redundancy"

Frame each as: here's what people think → here's the reality → here's what you should actually consider.`,

  personal_take: `Generate 12 "Personal Takes / Behind the Scenes" social media posts.

These humanize the brand. They're observations, opinions, and stories from working in the telecom consulting industry.

Angles to cover (vary across posts):
- Frustrating carrier experiences (without naming specific carriers negatively)
- What we commonly find when auditing bills
- Trends in business telecom
- Why redundancy matters more than people think
- The most common mistake businesses make with their telecom
- What surprised us about a recent audit
- How the industry has changed
- Why we became carrier-agnostic instead of working for one carrier
- The difference between what carriers promise and what they deliver
- Small things that make a big difference in business connectivity
- Honest observations about pricing, service, and support in the industry

These should feel like genuine thoughts from someone who works in this space every day — not marketing content.`,
};

export function buildCategoryPrompt(category: ContentCategory): string {
  return `${CATEGORY_PROMPTS[category]}

For each of the 12 posts, generate FOUR platform-specific versions:

1. linkedin_content: 150-300 words. Use line breaks for readability. Professional but conversational. 2-3 hashtags max at the end. Include a CTA to www.insero.cloud/audit in about 30% of posts (3-4 out of 12).

2. x_content: Under 280 characters. Punchy, direct, no hashtags unless truly relevant. The single best sentence or thought from the LinkedIn version. Never include URLs.

3. facebook_content: 100-200 words. Slightly more casual than LinkedIn. 1-2 hashtags max. Ask questions to encourage comments in some posts.

4. google_content: 80-150 words. Informative and local-business focused. Include a CTA to call (844) 252-3185 or visit www.insero.cloud in about 50% of posts (5-6 out of 12). No hashtags.

Respond with a JSON array of 12 objects. Each object must have exactly these fields:
{
  "linkedin_content": "...",
  "x_content": "...",
  "facebook_content": "...",
  "google_content": "..."
}

Return ONLY the JSON array. No markdown fences, no explanation, no extra text.`;
}
