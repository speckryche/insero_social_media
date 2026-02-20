"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const TEMPLATES = [
  { key: "stat_card", label: "Stat Card", desc: "Dark bg, big stat number in primary blue" },
  { key: "quote_card", label: "Quote Card", desc: "White bg, decorative quote mark, left accent border" },
  { key: "tip_graphic", label: "Tip Graphic", desc: "Blue gradient bg, category pill badge" },
  { key: "comparison", label: "Comparison", desc: "Split red/green layout, before/after" },
  { key: "savings_highlight", label: "Savings Highlight", desc: "Dark bg, large dollar amount in green" },
  { key: "myth_buster", label: "Myth Buster", desc: "White bg, MYTH strikethrough / REALITY pills" },
  { key: "did_you_know", label: "Did You Know", desc: "Primary blue bg, question mark watermark" },
  { key: "checklist", label: "Checklist", desc: "White bg, green checkmark items" },
];

const PLATFORMS = [
  { key: "linkedin", label: "LinkedIn", size: "1200x627" },
  { key: "facebook", label: "Facebook", size: "1200x630" },
  { key: "x", label: "X (Twitter)", size: "1200x675" },
  { key: "google", label: "Google", size: "1200x900" },
];

export default function TestTemplatesPage() {
  const [platform, setPlatform] = useState("linkedin");

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Image Template Preview
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            All 8 branded image templates with sample data
          </p>
        </div>
      </div>

      {/* Platform selector */}
      <div className="flex gap-2">
        {PLATFORMS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPlatform(p.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              platform === p.key
                ? "bg-[#1B2A4A] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {p.label}
            <span className="ml-1.5 text-xs opacity-60">{p.size}</span>
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {TEMPLATES.map((t) => (
          <div key={t.key} className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{t.label}</h3>
              <p className="text-xs text-gray-500">{t.desc}</p>
            </div>
            <div className="border rounded-lg overflow-hidden bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/preview-template?template=${t.key}&platform=${platform}`}
                alt={t.label}
                className="w-full h-auto"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
