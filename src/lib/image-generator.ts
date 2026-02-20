import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import { readFileSync } from "fs";
import path from "path";

// Brand colors
const COLORS = {
  darkBg: "#1B2A4A",
  primaryBlue: "#3B82F6",
  accentGreen: "#22C55E",
  white: "#FFFFFF",
  lightGray: "#F3F4F6",
  mediumGray: "#9CA3AF",
  darkText: "#111827",
  darkText2: "#2c3e50",
  red: "#EF4444",
  greenText: "#10b981",
  redText: "#ef4444",
  lightBlue: "#d6eaf8",
  teal: "#1abc9c",
};

// Platform dimensions
export const PLATFORM_SIZES: Record<string, { width: number; height: number }> = {
  linkedin: { width: 1200, height: 627 },
  facebook: { width: 1200, height: 630 },
  x: { width: 1200, height: 675 },
  google: { width: 1200, height: 900 },
};

export type ImageTemplateType =
  | "stat_card"
  | "quote_card"
  | "tip_graphic"
  | "comparison"
  | "savings_highlight"
  | "myth_buster"
  | "did_you_know"
  | "checklist";

interface ImageOptions {
  templateType: ImageTemplateType;
  headline: string;
  bodyText: string;
  statNumber?: string;
  statLabel?: string;
  category?: string;
  width: number;
  height: number;
}

// Map template types to their PNG filenames
const TEMPLATE_FILES: Record<ImageTemplateType, string> = {
  stat_card: "template-stat-card.png.png",
  quote_card: "template-quote-card.png",
  tip_graphic: "template-tip-graphic.png",
  comparison: "template-comparison.png",
  savings_highlight: "template-savings-highlight.png",
  myth_buster: "template-myth-buster.png",
  did_you_know: "template-did-you-know.png",
  checklist: "template-checklist.png",
};

let fontsRegistered = false;

function registerFonts() {
  if (fontsRegistered) return;
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  GlobalFonts.registerFromPath(path.join(fontsDir, "PlusJakartaSans-Bold.ttf"), "Jakarta Bold");
  GlobalFonts.registerFromPath(path.join(fontsDir, "PlusJakartaSans-SemiBold.ttf"), "Jakarta SemiBold");
  GlobalFonts.registerFromPath(path.join(fontsDir, "PlusJakartaSans-Medium.ttf"), "Jakarta Medium");
  GlobalFonts.registerFromPath(path.join(fontsDir, "PlusJakartaSans-Regular.ttf"), "Jakarta");
  GlobalFonts.registerFromPath(path.join(fontsDir, "PlusJakartaSans-ExtraBold.ttf"), "Jakarta ExtraBold");
  GlobalFonts.registerFromPath(path.join(fontsDir, "OpenSans-Regular.ttf"), "Open Sans");
  GlobalFonts.registerFromPath(path.join(fontsDir, "OpenSans-SemiBold.ttf"), "Open Sans SemiBold");
  GlobalFonts.registerFromPath(path.join(fontsDir, "OpenSans-Bold.ttf"), "Open Sans Bold");
  fontsRegistered = true;
}

function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function drawRoundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function loadTemplateBackground(
  ctx: SKRSContext2D,
  templateType: ImageTemplateType,
  width: number,
  height: number
) {
  const fileName = TEMPLATE_FILES[templateType];
  const templatePath = path.join(process.cwd(), "src", "assets", "templates", fileName);
  const imageData = readFileSync(templatePath);
  const img = await loadImage(imageData);
  ctx.drawImage(img, 0, 0, width, height);
}

function renderStatCard(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, bodyText, statNumber, statLabel } = opts;
  const pad = 80;
  const textW = width - pad * 2;

  // Stat number — centered at Y ~200
  ctx.font = '108px "Jakarta ExtraBold"';
  ctx.fillStyle = COLORS.primaryBlue;
  const num = statNumber || "73%";
  const numWidth = ctx.measureText(num).width;
  ctx.fillText(num, (width - numWidth) / 2, 200);

  // Stat label — centered below number
  if (statLabel) {
    ctx.font = '40px "Open Sans SemiBold"';
    ctx.fillStyle = COLORS.mediumGray;
    const labelWidth = ctx.measureText(statLabel).width;
    ctx.fillText(statLabel, (width - labelWidth) / 2, 250);
  }

  // Headline as body text — centered below
  ctx.font = '36px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 310;
  for (const line of headlineLines.slice(0, 3)) {
    const lw = ctx.measureText(line).width;
    ctx.fillText(line, (width - lw) / 2, yPos);
    yPos += 48;
  }

  // Supporting body text
  ctx.font = '32px "Open Sans"';
  ctx.fillStyle = COLORS.mediumGray;
  const bodyLines = wrapText(ctx, bodyText, textW);
  yPos += 10;
  for (const line of bodyLines.slice(0, 3)) {
    const lw = ctx.measureText(line).width;
    ctx.fillText(line, (width - lw) / 2, yPos);
    yPos += 42;
  }
}

function renderQuoteCard(ctx: SKRSContext2D, opts: ImageOptions) {
  const { headline, bodyText } = opts;

  const pad = 100;
  const textW = 900;

  // Quote text (headline) — left-aligned, starting at Y: 140
  ctx.font = '40px "Jakarta SemiBold"';
  ctx.fillStyle = COLORS.darkText;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 140;
  for (const line of headlineLines.slice(0, 5)) {
    ctx.fillText(line, pad, yPos);
    yPos += 54;
  }

  // Attribution — below quote with 40px gap
  ctx.font = '28px "Open Sans"';
  ctx.fillStyle = COLORS.mediumGray;
  yPos += 40;
  const bodyLines = wrapText(ctx, bodyText, textW);
  for (const line of bodyLines.slice(0, 2)) {
    ctx.fillText(line, pad, yPos);
    yPos += 38;
  }
}

function renderTipGraphic(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, bodyText, category } = opts;
  const pad = 80;
  const textW = width - pad * 2;

  // Category pill badge
  if (category) {
    ctx.font = '18px "Jakarta SemiBold"';
    const pillText = category.toUpperCase();
    const pillWidth = ctx.measureText(pillText).width + 32;
    drawRoundedRect(ctx, pad, 60, pillWidth, 36, 18);
    ctx.fillStyle = COLORS.teal;
    ctx.fill();
    ctx.fillStyle = COLORS.white;
    ctx.fillText(pillText, pad + 16, 84);
  }

  // Headline — 48px bold white, starting at Y: 140
  ctx.font = '48px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 140;
  for (const line of headlineLines.slice(0, 3)) {
    ctx.fillText(line, pad, yPos);
    yPos += 62;
  }

  // Body — 32px light blue, below headline with 30px gap
  ctx.font = '32px "Open Sans"';
  ctx.fillStyle = COLORS.lightBlue;
  const bodyLines = wrapText(ctx, bodyText, textW);
  yPos += 30;
  for (const line of bodyLines.slice(0, 3)) {
    ctx.fillText(line, pad, yPos);
    yPos += 42;
  }
}

function renderComparison(ctx: SKRSContext2D, opts: ImageOptions) {
  const { headline, bodyText } = opts;
  const leftX = 60;
  const rightX = 660;
  const colW = 500;

  // Parse comparison data — headline is "before" content, bodyText may contain "|||" separator
  let beforeText = headline;
  let afterText = bodyText;

  // If bodyText contains "|||", split into before/after
  if (bodyText.includes("|||")) {
    const parts = bodyText.split("|||");
    beforeText = parts[0].trim();
    afterText = parts[1].trim();
  }

  // Left side "BEFORE" label
  ctx.fillStyle = COLORS.redText;
  ctx.font = '28px "Jakarta Bold"';
  ctx.fillText("BEFORE", leftX, 60);

  // Right side "AFTER" label
  ctx.fillStyle = COLORS.greenText;
  ctx.font = '28px "Jakarta Bold"';
  ctx.fillText("AFTER", rightX, 60);

  // Left content — split by "|" for bullet points
  const leftItems = beforeText.split("|").map(s => s.trim()).filter(Boolean);
  ctx.font = '30px "Jakarta SemiBold"';
  ctx.fillStyle = COLORS.darkText2;
  let leftY = 120;
  for (const item of leftItems.slice(0, 4)) {
    const lines = wrapText(ctx, item, colW);
    for (const line of lines) {
      ctx.fillText(line, leftX, leftY);
      leftY += 40;
    }
    leftY += 10; // gap between items
  }

  // Right content — split by "|" for bullet points
  const rightItems = afterText.split("|").map(s => s.trim()).filter(Boolean);
  ctx.font = '30px "Jakarta SemiBold"';
  ctx.fillStyle = COLORS.darkText2;
  let rightY = 120;
  for (const item of rightItems.slice(0, 4)) {
    const lines = wrapText(ctx, item, colW);
    for (const line of lines) {
      ctx.fillText(line, rightX, rightY);
      rightY += 40;
    }
    rightY += 10; // gap between items
  }
}

function renderSavingsHighlight(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, bodyText, statNumber, statLabel } = opts;
  const pad = 80;
  const textW = width - pad * 2;

  // Dollar amount — centered at Y ~200
  ctx.font = '108px "Jakarta ExtraBold"';
  ctx.fillStyle = COLORS.accentGreen;
  const amount = statNumber || "$4,200";
  const amountW = ctx.measureText(amount).width;
  ctx.fillText(amount, (width - amountW) / 2, 200);

  // Savings label — centered below with 20px gap
  if (statLabel) {
    ctx.font = '44px "Open Sans SemiBold"';
    ctx.fillStyle = COLORS.accentGreen;
    ctx.globalAlpha = 0.8;
    const labelW = ctx.measureText(statLabel).width;
    ctx.fillText(statLabel, (width - labelW) / 2, 260);
    ctx.globalAlpha = 1;
  }

  // Headline context — centered below with 30px gap
  ctx.font = '36px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 330;
  for (const line of headlineLines.slice(0, 2)) {
    const lw = ctx.measureText(line).width;
    ctx.fillText(line, (width - lw) / 2, yPos);
    yPos += 48;
  }

  // Body text
  ctx.font = '32px "Open Sans"';
  ctx.fillStyle = COLORS.mediumGray;
  const bodyLines = wrapText(ctx, bodyText, textW);
  yPos += 10;
  for (const line of bodyLines.slice(0, 3)) {
    const lw = ctx.measureText(line).width;
    ctx.fillText(line, (width - lw) / 2, yPos);
    yPos += 42;
  }
}

function renderMythBuster(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, bodyText } = opts;
  const x = 80;
  const textW = width - x * 2;

  // MYTH pill badge — centered in top half (light red zone)
  drawRoundedRect(ctx, x, 100, 120, 36, 18);
  ctx.fillStyle = COLORS.redText;
  ctx.fill();
  ctx.font = '18px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  ctx.fillText("MYTH", x + 30, 124);

  // Myth text — 36px, starting at Y: 150
  ctx.font = '36px "Jakarta SemiBold"';
  ctx.fillStyle = COLORS.darkText;
  const mythLines = wrapText(ctx, headline, textW);
  let yPos = 150;
  const mythTextStartY = yPos;
  for (const line of mythLines.slice(0, 3)) {
    ctx.fillText(line, x, yPos);
    yPos += 48;
  }
  const mythTextEndY = yPos - 48; // Y of last line baseline

  // Red strikethrough line through the myth text only
  ctx.strokeStyle = COLORS.redText;
  ctx.lineWidth = 3;
  ctx.beginPath();
  const strikeY = mythTextStartY + (mythTextEndY - mythTextStartY) / 2 - 6;
  ctx.moveTo(x, strikeY);
  // Find the widest myth text line for strikethrough width
  let maxMythWidth = 0;
  for (const line of mythLines.slice(0, 3)) {
    const w = ctx.measureText(line).width;
    if (w > maxMythWidth) maxMythWidth = w;
  }
  ctx.lineTo(x + maxMythWidth, strikeY);
  ctx.stroke();

  // REALITY pill badge — centered in bottom half (light green zone, starts ~Y:313)
  drawRoundedRect(ctx, x, 370, 140, 36, 18);
  ctx.fillStyle = COLORS.greenText;
  ctx.fill();
  ctx.font = '18px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  ctx.fillText("REALITY", x + 24, 394);

  // Reality text — 36px bold, starting at Y: 420
  ctx.font = '36px "Jakarta Bold"';
  ctx.fillStyle = COLORS.darkText;
  const realityLines = wrapText(ctx, bodyText, textW);
  yPos = 420;
  for (const line of realityLines.slice(0, 3)) {
    ctx.fillText(line, x, yPos);
    yPos += 48;
  }
}

function renderDidYouKnow(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, bodyText } = opts;
  const pad = 100;
  const textW = width - pad * 2;

  // "DID YOU KNOW?" header — 48px bold
  ctx.font = '48px "Jakarta Bold"';
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("DID YOU KNOW?", pad, 100);

  // Body text (headline used as main content) — 40px, starting at Y: 200
  ctx.font = '40px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 200;
  for (const line of headlineLines.slice(0, 4)) {
    ctx.fillText(line, pad, yPos);
    yPos += 54;
  }

  // Supporting body text
  ctx.font = '32px "Open Sans"';
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  const bodyLines = wrapText(ctx, bodyText, textW);
  yPos += 20;
  for (const line of bodyLines.slice(0, 3)) {
    ctx.fillText(line, pad, yPos);
    yPos += 42;
  }
}

function renderChecklist(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, bodyText } = opts;
  const pad = 80;
  const textW = width - pad * 2;

  // Title — 48px bold, at Y: 60
  ctx.font = '48px "Jakarta Bold"';
  ctx.fillStyle = COLORS.darkText;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 80;
  for (const line of headlineLines.slice(0, 2)) {
    ctx.fillText(line, pad, yPos);
    yPos += 60;
  }

  // Checklist items — starting at Y: 150, spaced 68px apart
  const items = bodyText.split(/[|\n]/).map((s) => s.trim()).filter(Boolean);
  const startY = Math.max(yPos + 20, 150);
  yPos = startY;
  for (const item of items.slice(0, 5)) {
    // Green checkmark
    ctx.fillStyle = COLORS.greenText;
    ctx.font = '36px "Jakarta Bold"';
    ctx.fillText("\u2713", pad, yPos);
    // Item text
    ctx.fillStyle = COLORS.darkText;
    ctx.font = '32px "Open Sans"';
    ctx.fillText(item, pad + 45, yPos);
    yPos += 68;
  }
}

const RENDERERS: Record<ImageTemplateType, (ctx: SKRSContext2D, opts: ImageOptions) => void> = {
  stat_card: renderStatCard,
  quote_card: renderQuoteCard,
  tip_graphic: renderTipGraphic,
  comparison: renderComparison,
  savings_highlight: renderSavingsHighlight,
  myth_buster: renderMythBuster,
  did_you_know: renderDidYouKnow,
  checklist: renderChecklist,
};

export async function generatePostImage(opts: ImageOptions): Promise<Buffer> {
  registerFonts();
  const canvas = createCanvas(opts.width, opts.height);
  const ctx = canvas.getContext("2d");

  // Load template background
  await loadTemplateBackground(ctx, opts.templateType, opts.width, opts.height);

  const renderer = RENDERERS[opts.templateType];
  if (!renderer) {
    throw new Error(`Unknown template type: ${opts.templateType}`);
  }

  renderer(ctx, opts);
  return canvas.toBuffer("image/png");
}
