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
  red: "#EF4444",
  greenText: "#16A34A",
  redText: "#DC2626",
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
  const { width, height, headline, bodyText, statNumber, statLabel } = opts;

  // Big stat number
  ctx.font = '120px "Jakarta ExtraBold"';
  ctx.fillStyle = COLORS.primaryBlue;
  const num = statNumber || "73%";
  ctx.fillText(num, 60, height * 0.45);

  // Stat label
  if (statLabel) {
    ctx.font = '28px "Open Sans SemiBold"';
    ctx.fillStyle = COLORS.mediumGray;
    ctx.fillText(statLabel, 60, height * 0.45 + 40);
  }

  // Headline
  ctx.font = '36px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, width - 120);
  let yPos = height * 0.6;
  for (const line of headlineLines) {
    ctx.fillText(line, 60, yPos);
    yPos += 46;
  }

  // Body
  ctx.font = '22px "Open Sans"';
  ctx.fillStyle = COLORS.mediumGray;
  const bodyLines = wrapText(ctx, bodyText, width - 120);
  for (const line of bodyLines.slice(0, 2)) {
    ctx.fillText(line, 60, yPos + 10);
    yPos += 32;
  }
}

function renderQuoteCard(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, height, headline, bodyText } = opts;

  // Quote text (headline)
  ctx.font = '32px "Jakarta SemiBold"';
  ctx.fillStyle = COLORS.darkText;
  const headlineLines = wrapText(ctx, headline, width - 160);
  let yPos = height * 0.35;
  for (const line of headlineLines.slice(0, 3)) {
    ctx.fillText(line, 80, yPos);
    yPos += 44;
  }

  // Body
  ctx.font = '22px "Open Sans"';
  ctx.fillStyle = COLORS.mediumGray;
  const bodyLines = wrapText(ctx, bodyText, width - 160);
  yPos += 16;
  for (const line of bodyLines.slice(0, 2)) {
    ctx.fillText(line, 80, yPos);
    yPos += 32;
  }
}

function renderTipGraphic(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, height, headline, bodyText, category } = opts;

  // Category pill badge
  if (category) {
    ctx.font = '16px "Jakarta SemiBold"';
    const pillText = category.toUpperCase();
    const pillWidth = ctx.measureText(pillText).width + 32;
    drawRoundedRect(ctx, 60, 100, pillWidth, 36, 18);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fill();
    ctx.fillStyle = COLORS.white;
    ctx.fillText(pillText, 76, 124);
  }

  // Headline
  ctx.font = '40px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, width - 120);
  let yPos = height * 0.4;
  for (const line of headlineLines.slice(0, 3)) {
    ctx.fillText(line, 60, yPos);
    yPos += 52;
  }

  // Body
  ctx.font = '24px "Open Sans"';
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  const bodyLines = wrapText(ctx, bodyText, width - 120);
  yPos += 12;
  for (const line of bodyLines.slice(0, 2)) {
    ctx.fillText(line, 60, yPos);
    yPos += 34;
  }
}

function renderComparison(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, bodyText } = opts;
  const halfW = width / 2;

  // Left header
  ctx.fillStyle = COLORS.redText;
  ctx.font = '24px "Jakarta Bold"';
  ctx.fillText("BEFORE", 60, 80);

  // Right header
  ctx.fillStyle = COLORS.greenText;
  ctx.font = '24px "Jakarta Bold"';
  ctx.fillText("AFTER", halfW + 60, 80);

  // Content on left
  ctx.font = '28px "Jakarta SemiBold"';
  ctx.fillStyle = COLORS.darkText;
  const leftLines = wrapText(ctx, headline, halfW - 120);
  let yPos = 140;
  for (const line of leftLines.slice(0, 4)) {
    ctx.fillText(line, 60, yPos);
    yPos += 40;
  }

  // Content on right
  ctx.font = '28px "Jakarta SemiBold"';
  ctx.fillStyle = COLORS.darkText;
  const rightLines = wrapText(ctx, bodyText, halfW - 120);
  yPos = 140;
  for (const line of rightLines.slice(0, 4)) {
    ctx.fillText(line, halfW + 60, yPos);
    yPos += 40;
  }
}

function renderSavingsHighlight(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, height, headline, bodyText, statNumber, statLabel } = opts;

  // Large dollar amount in accent green
  ctx.font = '100px "Jakarta ExtraBold"';
  ctx.fillStyle = COLORS.accentGreen;
  const amount = statNumber || "$4,200";
  ctx.fillText(amount, 60, height * 0.42);

  // Savings label
  if (statLabel) {
    ctx.font = '26px "Open Sans SemiBold"';
    ctx.fillStyle = COLORS.accentGreen;
    ctx.globalAlpha = 0.8;
    ctx.fillText(statLabel, 60, height * 0.42 + 40);
    ctx.globalAlpha = 1;
  }

  // Headline
  ctx.font = '34px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, width - 120);
  let yPos = height * 0.6;
  for (const line of headlineLines.slice(0, 2)) {
    ctx.fillText(line, 60, yPos);
    yPos += 46;
  }

  // Body
  ctx.font = '22px "Open Sans"';
  ctx.fillStyle = COLORS.mediumGray;
  const bodyLines = wrapText(ctx, bodyText, width - 120);
  yPos += 8;
  for (const line of bodyLines.slice(0, 2)) {
    ctx.fillText(line, 60, yPos);
    yPos += 32;
  }
}

function renderMythBuster(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, height, headline, bodyText } = opts;

  // MYTH pill
  const mythY = height * 0.3;
  drawRoundedRect(ctx, 60, mythY - 28, 120, 40, 20);
  ctx.fillStyle = "#FEE2E2";
  ctx.fill();
  ctx.font = '18px "Jakarta Bold"';
  ctx.fillStyle = COLORS.redText;
  ctx.fillText("MYTH", 84, mythY);
  // Strikethrough line
  ctx.strokeStyle = COLORS.redText;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, mythY - 6);
  ctx.lineTo(164, mythY - 6);
  ctx.stroke();

  // Myth text (headline)
  ctx.font = '28px "Jakarta SemiBold"';
  ctx.fillStyle = COLORS.darkText;
  const mythLines = wrapText(ctx, headline, width - 120);
  let yPos = mythY + 40;
  for (const line of mythLines.slice(0, 2)) {
    ctx.fillText(line, 60, yPos);
    yPos += 38;
  }

  // REALITY pill
  const realityY = yPos + 24;
  drawRoundedRect(ctx, 60, realityY - 28, 140, 40, 20);
  ctx.fillStyle = "#DCFCE7";
  ctx.fill();
  ctx.font = '18px "Jakarta Bold"';
  ctx.fillStyle = COLORS.greenText;
  ctx.fillText("REALITY", 80, realityY);

  // Reality text (bodyText)
  ctx.font = '28px "Jakarta SemiBold"';
  ctx.fillStyle = COLORS.darkText;
  const realityLines = wrapText(ctx, bodyText, width - 120);
  yPos = realityY + 40;
  for (const line of realityLines.slice(0, 2)) {
    ctx.fillText(line, 60, yPos);
    yPos += 38;
  }
}

function renderDidYouKnow(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, height, headline, bodyText } = opts;

  // "DID YOU KNOW?" label
  ctx.font = '20px "Jakarta Bold"';
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("DID YOU KNOW?", 60, 120);

  // Headline
  ctx.font = '40px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, width - 200);
  let yPos = height * 0.38;
  for (const line of headlineLines.slice(0, 3)) {
    ctx.fillText(line, 60, yPos);
    yPos += 54;
  }

  // Body
  ctx.font = '24px "Open Sans"';
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  const bodyLines = wrapText(ctx, bodyText, width - 200);
  yPos += 12;
  for (const line of bodyLines.slice(0, 2)) {
    ctx.fillText(line, 60, yPos);
    yPos += 34;
  }
}

function renderChecklist(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, bodyText } = opts;

  // Headline
  ctx.font = '36px "Jakarta Bold"';
  ctx.fillStyle = COLORS.darkText;
  const headlineLines = wrapText(ctx, headline, width - 120);
  let yPos = 140;
  for (const line of headlineLines.slice(0, 2)) {
    ctx.fillText(line, 60, yPos);
    yPos += 48;
  }

  // Checklist items from bodyText (split by | or newline)
  const items = bodyText.split(/[|\n]/).map((s) => s.trim()).filter(Boolean);
  ctx.font = '26px "Open Sans"';
  yPos += 20;
  for (const item of items.slice(0, 5)) {
    // Green checkmark
    ctx.fillStyle = COLORS.accentGreen;
    ctx.font = '26px "Jakarta Bold"';
    ctx.fillText("\u2713", 60, yPos);
    // Item text
    ctx.fillStyle = COLORS.darkText;
    ctx.font = '24px "Open Sans"';
    ctx.fillText(item, 100, yPos);
    yPos += 44;
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
