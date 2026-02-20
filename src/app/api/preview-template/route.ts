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
    headline: "Most SMBs overspend on telecom services without realizing it",
    bodyText: "A simple audit of your voice and internet bills can reveal thousands in annual savings that add up fast.",
    statNumber: "73%",
    statLabel: "of SMBs overspend on telecom",
  },
  quote_card: {
    headline: "We had no idea we were paying for 8 unused phone lines until Insero ran an audit. The savings were immediate and the process was painless.",
    bodyText: "— Dental practice, 22 employees, Medford OR",
  },
  tip_graphic: {
    headline: "Stop paying for phone lines nobody uses",
    bodyText: "Audit your telecom bills quarterly. Most businesses have 3-5 unused lines they're still paying for, often at full price.",
    category: "Industry Tip",
  },
  comparison: {
    headline: "Paying for 12 unused lines|No backup internet|5-year-old phone system",
    bodyText: "Paying for 12 unused lines|No backup internet|5-year-old phone system|||Only paying for active lines|Redundant internet connection|Modern cloud phone system",
  },
  savings_highlight: {
    headline: "How a 12-person accounting firm cut telecom costs in half",
    bodyText: "Consolidated three vendors into one, eliminated redundant lines, and moved to a modern cloud phone system.",
    statNumber: "$4,200",
    statLabel: "/year in savings",
  },
  myth_buster: {
    headline: "Using a broker costs more than going direct to the carrier",
    bodyText: "Brokers get the same or better pricing because carriers offer them bulk promotions. You pay nothing extra — the carrier pays the broker's commission.",
  },
  did_you_know: {
    headline: "The average small business overpays by $400/month on telecom services they don't fully use",
    bodyText: "That adds up to nearly $5,000 per year in wasted spend. A free audit can identify exactly where the money is going.",
  },
  checklist: {
    headline: "5 Signs You're Overpaying for Telecom",
    bodyText: "Review all line items monthly|Cancel unused phone lines|Compare carrier pricing annually|Check contract renewal dates|Ask about bundling discounts",
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
    const buffer = await generatePostImage({
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
