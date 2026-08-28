// Current-events feeds scanned before a batch, so posts can reference real
// news instead of inventing it. Nothing here is used unless the user picks
// items in the Generate dialog.

export type HeadlineFeed =
  | "ai_tech"
  | "ai_voice"
  | "crypto"
  | "ai_building"
  | "small_business"
  | "telecom_industry";

// A feed belongs to exactly one audience. Company feeds are scanned for the
// company page — prospects and their IT people. Personal feeds are scanned
// for Speck's own profile, where the readers are peers and other operators.
export type FeedScope = "company" | "personal";

export const FEEDS_BY_SCOPE: Record<FeedScope, HeadlineFeed[]> = {
  company: ["ai_tech", "ai_voice"],
  personal: ["crypto", "ai_building", "small_business", "telecom_industry"],
};

export const HEADLINE_FEEDS: HeadlineFeed[] = [
  ...FEEDS_BY_SCOPE.company,
  ...FEEDS_BY_SCOPE.personal,
];

export const SCOPE_BY_FEED: Record<HeadlineFeed, FeedScope> = {
  ai_tech: "company",
  ai_voice: "company",
  crypto: "personal",
  ai_building: "personal",
  small_business: "personal",
  telecom_industry: "personal",
};

// Company feeds are scanned two-deep so each goes further; personal feeds are
// scanned four-wide and shallower, since a personal post needs one hook, not
// a survey of the week.
export const HEADLINES_PER_FEED: Record<FeedScope, number> = {
  company: 5,
  personal: 3,
};

export const FEED_LABELS: Record<HeadlineFeed, string> = {
  ai_tech: "AI & Tech",
  ai_voice: "AI in Voice",
  crypto: "Crypto",
  ai_building: "Building with AI",
  small_business: "Small Business",
  telecom_industry: "Telecom Industry",
};

/**
 * Which feed scopes a batch needs scanning. A "both" batch draws on each
 * audience's feeds, so it reads one scan per scope.
 */
export function scanScopesForBatch(
  batchScope: string | null | undefined
): FeedScope[] {
  if (batchScope === "company") return ["company"];
  if (batchScope === "personal") return ["personal"];
  // "both", and the NULL scope that predates the column.
  return ["company", "personal"];
}

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
  // ai_tech reaches pots_speak, but its prompt filters to copper-shutdown
  // and carrier-change items only.
  pots_speak: ["ai_tech"],
  // The only personal category, so it draws on every personal feed. ai_tech
  // is deliberately absent: it is written for prospects, and personal_take
  // is not.
  personal_take: ["crypto", "ai_building", "small_business", "telecom_industry"],
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
