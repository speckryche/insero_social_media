import { NextRequest, NextResponse } from "next/server";
import { generatePostImage, PLATFORM_SIZES, type ImageTemplateType } from "@/lib/image-generator";

const SAMPLE_DATA: Record<ImageTemplateType, {
  headline: string;
  bodyText: string;
  statNumber?: string;
  statLabel?: string;
  category?: string;
}> = {
  stat_card: {
    headline: "Small businesses lose thousands to outdated technology every year",
    bodyText: "The right IT partner can cut costs and boost productivity overnight.",
    statNumber: "73%",
    statLabel: "of SMBs overspend on IT",
  },
  quote_card: {
    headline: "We switched to managed IT and saved over $50K in the first year — wish we'd done it sooner.",
    bodyText: "Real results from a real Insero client in the dental industry.",
  },
  tip_graphic: {
    headline: "Stop paying for software licenses you don't use",
    bodyText: "Audit your subscriptions quarterly. Most businesses have 3-5 redundant tools.",
    category: "Industry Tip",
  },
  comparison: {
    headline: "Managing IT in-house with constant firefighting and surprise bills",
    bodyText: "Proactive managed IT with predictable monthly costs and zero downtime",
  },
  savings_highlight: {
    headline: "How a 12-person accounting firm cut IT costs in half",
    bodyText: "Consolidated vendors, eliminated redundant tools, and moved to the cloud.",
    statNumber: "$4,200",
    statLabel: "saved per month",
  },
  myth_buster: {
    headline: "Small businesses don't need cybersecurity — hackers only target big companies",
    bodyText: "43% of cyberattacks target small businesses. Most lack basic protections.",
  },
  did_you_know: {
    headline: "The average employee wastes 22 minutes a day on IT issues",
    bodyText: "That adds up to over 2 weeks of lost productivity per year per person.",
  },
  checklist: {
    headline: "5 Signs Your IT Provider Isn't Working",
    bodyText: "Slow response times|Recurring issues never get fixed|No proactive monitoring|Surprise invoices every month|You can't reach them after hours",
  },
};

export async function GET(request: NextRequest) {
  const template = request.nextUrl.searchParams.get("template") as ImageTemplateType;
  const platform = request.nextUrl.searchParams.get("platform") || "linkedin";

  if (!template || !SAMPLE_DATA[template]) {
    return NextResponse.json({ error: "Invalid template" }, { status: 400 });
  }

  const size = PLATFORM_SIZES[platform] || PLATFORM_SIZES.linkedin;
  const sample = SAMPLE_DATA[template];

  try {
    const buffer = generatePostImage({
      templateType: template,
      headline: sample.headline,
      bodyText: sample.bodyText,
      statNumber: sample.statNumber,
      statLabel: sample.statLabel,
      category: sample.category,
      width: size.width,
      height: size.height,
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image generation failed" },
      { status: 500 }
    );
  }
}
