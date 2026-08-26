// Current-events feeds scanned before a batch, so posts can reference real
// news instead of inventing it. Nothing here is used unless the user picks
// items in the Generate dialog.

export type HeadlineFeed = "crypto" | "ai_tech" | "ai_voice";

export const HEADLINE_FEEDS: HeadlineFeed[] = ["crypto", "ai_tech", "ai_voice"];

export const FEED_LABELS: Record<HeadlineFeed, string> = {
  crypto: "Crypto",
  ai_tech: "AI & Tech",
  ai_voice: "AI in Voice",
};

export interface HeadlineItem {
  // Stable within a scan, so the dialog can send back exactly what was picked.
  id: string;
  feed: HeadlineFeed;
  headline: string;
  summary: string;
  source_url: string;
  source_name: string;
  published_date: string;
}

// Which feeds each content category is allowed to draw from, per the content
// skill's headline-routing rules.
export const FEEDS_BY_CATEGORY: Record<string, HeadlineFeed[]> = {
  ai_speak: ["ai_voice"],
  tech_speak: ["ai_tech"],
  humor_speak: ["ai_tech"],
  personal_take: ["crypto", "ai_tech"],
  // quote_speak and cost_speak never receive headlines — their material is
  // the paperwork and the spend, not the news.
};

export function headlinesForCategory(
  category: string,
  picked: HeadlineItem[]
): HeadlineItem[] {
  const feeds = FEEDS_BY_CATEGORY[category];
  if (!feeds) return [];
  return picked.filter((item) => feeds.includes(item.feed));
}

export function isHeadlineItem(value: unknown): value is HeadlineItem {
  if (!value || typeof value !== "object") return false;
  const h = value as Record<string, unknown>;
  return (
    typeof h.id === "string" &&
    HEADLINE_FEEDS.includes(h.feed as HeadlineFeed) &&
    typeof h.headline === "string" &&
    h.headline.trim().length > 0 &&
    typeof h.source_url === "string"
  );
}
