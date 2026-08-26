import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import {
  stripCodeFences,
  escapeRawControlCharsInStrings,
} from "@/lib/json-repair";
import {
  HEADLINE_FEEDS,
  type HeadlineFeed,
  type HeadlineItem,
} from "@/lib/headlines";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// One brief per feed. Each runs as its own web-search call so a slow or empty
// feed can't starve the others.
const FEED_BRIEFS: Record<HeadlineFeed, string> = {
  crypto:
    "Major crypto industry events, regulation and policy moves, adoption by large companies, major product or chain launches, and notable price moves. Include price moves — the user decides what is worth posting about.",
  ai_tech: "The biggest AI and technology stories of the week.",
  ai_voice:
    "New AI features or announcements from RingCentral, Zoom, Dialpad, and Nextiva, and from UCaaS / CCaaS providers generally — AI receptionists, call summaries, agent assist, sentiment scoring, live translation, and similar.",
};

const SYSTEM_PROMPT = `You find recent, real news headlines and report them as JSON.

Rules:
- Only include items published in the last 14 days.
- Aim for 10 items. Six is a fine floor; do not pad with weak or duplicate stories to reach ten.
- Never return the same story twice, even from different outlets.
- Favor original sources — the company's own newsroom, the regulator, the primary outlet that broke it — over aggregators and rewrites.
- Never invent an item, a URL, or a date. If you cannot find enough real items, return fewer.
- "headline" is one line in plain English, not the outlet's headline verbatim if that headline is clickbait or jargon.
- "summary" is a single sentence.
- "published_date" is ISO format (YYYY-MM-DD).

You must respond with valid JSON only. No markdown, no code fences, no extra text.`;

async function scanFeed(
  anthropic: Anthropic,
  feed: HeadlineFeed
): Promise<HeadlineItem[]> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 16000,
    output_config: { effort: "low" },
    system: SYSTEM_PROMPT,
    // The _20260209 variant adds dynamic filtering, which matters more now
    // that each feed is asked to go 10 deep. The installed SDK's tool-type
    // union still stops at _20250305, so this is cast — the API accepts the
    // newer type on Sonnet 5. Drop the cast once the SDK is upgraded.
    tools: [
      { type: "web_search_20260209", name: "web_search" },
    ] as unknown as Anthropic.MessageCreateParams["tools"],
    messages: [
      {
        role: "user",
        content: `Search the web and return up to 10 recent headlines for this feed. Aim for 10; return fewer only if there genuinely are not that many real items in the window.

FEED: ${feed}
WHAT COUNTS: ${FEED_BRIEFS[feed]}

Return a JSON array. Each object must have exactly these fields:
[
  {
    "feed": "${feed}",
    "headline": "...",
    "summary": "...",
    "source_url": "https://...",
    "source_name": "...",
    "published_date": "YYYY-MM-DD"
  }
]

Return ONLY the JSON array. No markdown fences, no explanation, no extra text.`,
      },
    ],
  });

  // Server-tool turns can come back with several text blocks; the JSON is in
  // the last one, after the search results.
  const textBlocks = message.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  if (textBlocks.length === 0) return [];

  const raw = textBlocks[textBlocks.length - 1].text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(escapeRawControlCharsInStrings(stripCodeFences(raw)));
  } catch {
    console.error(`[headlines] could not parse ${feed} response`);
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object"
    )
    .filter(
      (item) =>
        typeof item.headline === "string" && item.headline.trim().length > 0
    )
    .map((item, i) => ({
      id: `${feed}-${i}`,
      feed,
      headline: String(item.headline).trim(),
      summary: typeof item.summary === "string" ? item.summary.trim() : "",
      source_url:
        typeof item.source_url === "string" ? item.source_url.trim() : "",
      source_name:
        typeof item.source_name === "string" ? item.source_name.trim() : "",
      published_date:
        typeof item.published_date === "string"
          ? item.published_date.trim()
          : "",
    }));
}

// POST — scan all three feeds and store the result as a headline_scans row.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const now = new Date();
    const month = Number(body.month) || now.getMonth() + 1;
    const year = Number(body.year) || now.getFullYear();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    // One call per feed, in parallel. A feed that throws yields no items
    // rather than failing the whole scan.
    const results = await Promise.all(
      HEADLINE_FEEDS.map((feed) =>
        scanFeed(anthropic, feed).catch((err) => {
          console.error(`[headlines] ${feed} scan failed:`, err);
          return [] as HeadlineItem[];
        })
      )
    );

    // Dedupe by URL across the whole scan — the same story can surface in more
    // than one feed. First occurrence wins. Items with no URL are kept, since
    // there is nothing to compare them on.
    const seenUrls = new Set<string>();
    const items = results.flat().filter((item) => {
      const key = item.source_url.trim().toLowerCase();
      if (!key) return true;
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    });

    const droppedAsDupes = results.flat().length - items.length;
    console.log(
      `[headlines] scanned ${items.length} items: ` +
        HEADLINE_FEEDS.map((f, i) => `${f}=${results[i].length}`).join(" ") +
        (droppedAsDupes > 0 ? ` (${droppedAsDupes} duplicate URLs dropped)` : "")
    );

    const supabase = getSupabase();
    const { data: scan, error } = await supabase
      .from("headline_scans")
      .insert({ month, year, items, picked: [] })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ scanId: scan.id, items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// PATCH — record which items the user picked, before generation runs.
export async function PATCH(request: NextRequest) {
  try {
    const { scanId, headlineIds } = await request.json();

    if (!scanId || !Array.isArray(headlineIds)) {
      return NextResponse.json(
        { error: "scanId and headlineIds[] are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const { data: scan, error: readError } = await supabase
      .from("headline_scans")
      .select("items")
      .eq("id", scanId)
      .single();

    if (readError || !scan) {
      return NextResponse.json(
        { error: readError?.message || "Scan not found" },
        { status: 404 }
      );
    }

    const picked = ((scan.items as HeadlineItem[]) || []).filter((item) =>
      headlineIds.includes(item.id)
    );

    const { error: writeError } = await supabase
      .from("headline_scans")
      .update({ picked })
      .eq("id", scanId);

    if (writeError) {
      return NextResponse.json({ error: writeError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, picked });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
