// Generate the 8 brand-consistent template background PNGs at 1080x1080.
// Run with: node scripts/generate-templates.mjs
//
// Filenames must match TEMPLATE_FILES in src/lib/image-generator.ts exactly,
// including the `template-stat-card.png.png` double-extension that's there
// for historical reasons.
//
// All coordinates are taken directly from the brand spec, written as if for
// a 1080x1080 canvas.

import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const W = 1080;
const H = 1080;
const OUT_DIR = path.join(process.cwd(), "src", "assets", "templates");

const COLORS = {
  forestGreen: "#008038",
  forestGreenDark: "#005C28",
  forestGreenDarker: "#004020",
  forestGreenLight: "#1FA855",
  forestGreenPale: "#E6F5EC",
  tangerine: "#F97316",
  charcoal: "#1A2530",
  white: "#FFFFFF",
  offWhite: "#FAFCFC",
  gray50: "#F7F9FA",
  red: "#EF4444",
};

// ----- Small drawing helpers -----

function fillRect(ctx, x, y, w, h, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function fillRoundedRect(ctx, x, y, w, h, r, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function strokeCircle(ctx, cx, cy, r, color, lineWidth = 1, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function fillCircle(ctx, cx, cy, r, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ----- Renderers (one per template) -----

function renderStatCard(ctx) {
  fillRect(ctx, 0, 0, W, H, COLORS.forestGreenDark);
  fillRect(ctx, 0, 0, W, 4, COLORS.tangerine);
  fillRect(ctx, 0, 1076, W, 4, COLORS.tangerine, 0.30);
  fillRoundedRect(ctx, 32, 24, 40, 3, 2, COLORS.tangerine);
  // Horizontal divider — full width below content area
  fillRect(ctx, 32, 860, 1016, 1, COLORS.white, 0.10);
  // Decorative concentric circles — bottom-right
  strokeCircle(ctx, 900, 900, 300, COLORS.white, 1, 0.06);
  strokeCircle(ctx, 900, 900, 200, COLORS.white, 1, 0.06);
}

function renderMythBuster(ctx) {
  fillRect(ctx, 0, 0, W, H, COLORS.charcoal);
  fillRect(ctx, 0, 0, 4, 400, COLORS.red, 0.80);
  fillRect(ctx, 0, 480, 4, 120, COLORS.forestGreenLight);
  fillRect(ctx, 32, 24, 336, 1, COLORS.white, 0.08);
  fillRect(ctx, 32, 370, 336, 1, COLORS.white, 0.08);
  // Top-right decorative circle
  strokeCircle(ctx, 960, 120, 200, COLORS.red, 1, 0.08);
  // Bottom-left decorative circle
  strokeCircle(ctx, 120, 960, 250, COLORS.forestGreenLight, 1, 0.08);
  // Myth zone line — full width
  fillRect(ctx, 32, 430, 1016, 1, COLORS.red, 0.20);
  // Reality zone line — full width
  fillRect(ctx, 32, 540, 1016, 1, COLORS.forestGreenLight, 0.20);
}

function renderDidYouKnow(ctx) {
  fillRect(ctx, 0, 0, W, H, COLORS.forestGreenDark);
  fillRect(ctx, 0, 0, W, 160, COLORS.forestGreenDarker);
  fillRect(ctx, 32, 160, W, 1, COLORS.white, 0.10);
  strokeCircle(ctx, 160, 80, 42, COLORS.tangerine, 2, 0.60);
  fillCircle(ctx, 160, 80, 16, COLORS.tangerine, 0.80);
  fillRect(ctx, 32, 920, 1016, 1, COLORS.white, 0.10);
  fillRoundedRect(ctx, 32, 928, 160, 3, 1, COLORS.tangerine, 0.70);
  strokeCircle(ctx, 950, 950, 270, COLORS.white, 0.5, 0.05);
}

function renderQuoteCard(ctx) {
  fillRect(ctx, 0, 0, W, H, COLORS.forestGreen);
  strokeCircle(ctx, 1020, 1020, 400, COLORS.white, 64, 0.06);
  strokeCircle(ctx, 1020, 1020, 270, COLORS.white, 44, 0.04);
  strokeCircle(ctx, 80, 80, 160, COLORS.tangerine, 32, 0.12);
  fillRect(ctx, 32, 940, 1016, 1, COLORS.white, 0.15);
  fillRoundedRect(ctx, 32, 948, 270, 3, 1, COLORS.tangerine, 0.60);
}

function renderSavingsHighlight(ctx) {
  fillRect(ctx, 0, 0, W, H, COLORS.forestGreen);
  fillRect(ctx, 0, 0, W, 6, COLORS.tangerine);
  fillRect(ctx, 0, 1074, W, 6, COLORS.forestGreenDark);
  fillRect(ctx, 32, 0, 1, H, COLORS.white, 0.10);
  strokeCircle(ctx, 540, 540, 430, COLORS.white, 0.5, 0.06);
  strokeCircle(ctx, 540, 540, 320, COLORS.tangerine, 0.5, 0.08);
  fillRect(ctx, 48, 920, 984, 1, COLORS.white, 0.15);
}

function renderTipGraphic(ctx) {
  fillRect(ctx, 0, 0, W, H, COLORS.forestGreenPale);
  fillRect(ctx, 0, 0, W, 6, COLORS.forestGreen);
  fillRect(ctx, 0, 1074, W, 6, COLORS.tangerine);
  fillRect(ctx, 0, 0, 160, H, COLORS.forestGreen, 0.06);
  fillRect(ctx, 160, 0, 1, H, COLORS.forestGreen, 0.12);
  fillCircle(ctx, 920, 160, 135, COLORS.forestGreen, 0.06);
  fillCircle(ctx, 920, 160, 80, COLORS.forestGreen, 0.06);
  fillRect(ctx, 80, 920, 970, 1, COLORS.forestGreen, 0.15);
  fillRoundedRect(ctx, 80, 928, 215, 3, 1, COLORS.tangerine);
}

function renderComparison(ctx) {
  fillRect(ctx, 0, 0, W, H, COLORS.gray50);
  fillRect(ctx, 0, 0, W, 150, COLORS.forestGreenDark);
  fillRect(ctx, 0, 150, W, 5, COLORS.tangerine);
  fillRect(ctx, 0, 925, W, 5, COLORS.forestGreen, 0.30);
  fillRect(ctx, 0, 930, W, 150, COLORS.forestGreenPale);
  fillRect(ctx, 536, 170, 2, 748, COLORS.forestGreen, 0.10);
  fillCircle(ctx, 540, 540, 22, COLORS.forestGreen, 0.12);
}

function renderChecklist(ctx) {
  fillRect(ctx, 0, 0, W, H, COLORS.offWhite);
  fillRect(ctx, 0, 0, 6, H, COLORS.forestGreen);
  fillRect(ctx, 6, 0, 145, H, COLORS.forestGreenPale);
  fillRect(ctx, 151, 0, 1, H, COLORS.forestGreen, 0.15);
  fillRoundedRect(ctx, 54, 270, 54, 54, 10, COLORS.forestGreen, 0.25);
  fillRoundedRect(ctx, 54, 378, 54, 54, 10, COLORS.forestGreen, 0.25);
  fillRoundedRect(ctx, 54, 486, 54, 54, 10, COLORS.forestGreen, 0.25);
  fillRoundedRect(ctx, 54, 594, 54, 54, 10, COLORS.tangerine, 0.50);
  fillRect(ctx, 0, 972, W, 108, COLORS.forestGreenPale);
  fillRect(ctx, 0, 972, W, 2, COLORS.forestGreen, 0.20);
}

// ----- Run -----

const TEMPLATES = [
  { filename: "template-stat-card.png.png",      render: renderStatCard },
  { filename: "template-myth-buster.png",        render: renderMythBuster },
  { filename: "template-did-you-know.png",       render: renderDidYouKnow },
  { filename: "template-quote-card.png",         render: renderQuoteCard },
  { filename: "template-savings-highlight.png",  render: renderSavingsHighlight },
  { filename: "template-tip-graphic.png",        render: renderTipGraphic },
  { filename: "template-comparison.png",         render: renderComparison },
  { filename: "template-checklist.png",          render: renderChecklist },
];

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

console.log(`Rendering ${TEMPLATES.length} templates at ${W}x${H} → ${OUT_DIR}\n`);

for (const t of TEMPLATES) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  t.render(ctx);
  const buf = canvas.toBuffer("image/png");
  const outPath = path.join(OUT_DIR, t.filename);
  writeFileSync(outPath, buf);
  const size = statSync(outPath).size;
  console.log(`  ✓ ${t.filename.padEnd(36)} ${(size / 1024).toFixed(1).padStart(7)} KB`);
}

console.log("\nDone.");
