import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import { readFileSync } from "fs";
import path from "path";

// Brand colors
const COLORS = {
  // Insero brand palette
  forestGreen: "#008038",
  forestGreenDark: "#005C28",
  forestGreenLight: "#1FA855",
  forestGreenPale: "#E6F5EC",
  tangerine: "#F97316",
  charcoal: "#1A2530",
  charcoalLight: "#2D3B47",
  pillGreenBg: "#C6E8D3",
  red: "#EF4444",
  white: "#FFFFFF",
  // Legacy colors retained for compatibility with any code outside the renderers
  darkBg: "#1B2A4A",
  primaryBlue: "#3B82F6",
  accentGreen: "#22C55E",
  lightGray: "#F3F4F6",
  mediumGray: "#9CA3AF",
  darkText: "#111827",
  darkText2: "#2c3e50",
  greenText: "#10b981",
  redText: "#ef4444",
  lightBlue: "#d6eaf8",
  teal: "#1abc9c",
};

// Platform dimensions — square 1080x1080 across all four targets so the
// brand template designs (1080x1080 backgrounds) render without aspect-ratio
// distortion. Renderer Y-coordinates below are tuned for this canvas height.
export const PLATFORM_SIZES: Record<string, { width: number; height: number }> = {
  linkedin: { width: 1080, height: 1080 },
  facebook: { width: 1080, height: 1080 },
  x: { width: 1080, height: 1080 },
  google: { width: 1080, height: 1080 },
};

export type ImageTemplateType =
  | "stat_card"
  | "quote_card"
  | "tip_graphic"
  | "comparison"
  | "savings_highlight"
  | "myth_buster"
  | "did_you_know"
  | "checklist"
  | "photo_landscape"
  | "photo_tip"
  | "photo_stat"
  | "photo_quote";

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

// Map template types to their PNG filenames. Only the 8 canvas-rendered
// templates have files here; the photo_* templates paint their background
// at render time via paintPhotoBackground().
const TEMPLATE_FILES: Partial<Record<ImageTemplateType, string>> = {
  stat_card: "template-stat-card.png.png",
  quote_card: "template-quote-card.png",
  tip_graphic: "template-tip-graphic.png",
  comparison: "template-comparison.png",
  savings_highlight: "template-savings-highlight.png",
  myth_buster: "template-myth-buster.png",
  did_you_know: "template-did-you-know.png",
  checklist: "template-checklist.png",
};

// Photo-based templates that fetch a background photo from Pexels and
// composite a branded color band over the bottom half. Queries are tuned
// for each template's editorial purpose.
const PHOTO_TEMPLATES: ImageTemplateType[] = [
  "photo_landscape",
  "photo_tip",
  "photo_stat",
  "photo_quote",
];

const PHOTO_QUERIES: Partial<Record<ImageTemplateType, string>> = {
  photo_landscape: "Pacific Northwest forest trail Oregon mountains",
  photo_tip: "business technology office communication",
  photo_stat: "modern office technology data",
  photo_quote: "Oregon landscape Pacific Northwest mountain view",
};

const PHOTO_BAND_COLORS: Partial<Record<ImageTemplateType, string>> = {
  photo_landscape: "#005C28",
  photo_tip: "#E6F5EC",
  photo_stat: "#1A2530",
  photo_quote: "#008038",
};

// Photo templates whose top-half image is rendered grayscale. Nature/
// landscape templates stay in full color; business/office templates are
// muted so the brand band stays the focal point.
const GRAYSCALE_TEMPLATES: ImageTemplateType[] = ["photo_tip", "photo_stat"];

const PHOTO_ZONE_HEIGHT = 520;

// Brand logo overlay. The two source files in /public are retina (2x) PNGs
// with no baked-in tagline; the canvas overlay picks the correct variant for
// the template's background lightness.
const LOGO_FILES = {
  dark: "insero-logo-dark_bg-no-tagline-retina.png",
  light: "insero-logo-light_bg-no-tagline-retina.png",
} as const;

const DARK_BG_TEMPLATES: ImageTemplateType[] = [
  "stat_card",
  "myth_buster",
  "quote_card",
  "savings_highlight",
  "did_you_know",
  // Photo templates: only photo_tip uses a light band, so it gets the dark
  // logo. The other three use dark bands and need the white logo.
  "photo_landscape",
  "photo_stat",
  "photo_quote",
];

const LOGO_HEIGHT = 32; // displayed px; brand guideline calls for 28-32px
const LOGO_PADDING = 24; // px from the canvas edge

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
  if (!fileName) {
    throw new Error(`No template PNG mapped for ${templateType}`);
  }
  const templatePath = path.join(process.cwd(), "src", "assets", "templates", fileName);
  const imageData = readFileSync(templatePath);
  const img = await loadImage(imageData);
  ctx.drawImage(img, 0, 0, width, height);
}

// Fetch a random Pexels photo URL for the given search query. Returns null
// if no API key is configured or the request fails — callers fall back to a
// solid color in that case. Pexels returns up to 15 results per page, and we
// pick one at random so repeat batches don't keep using the same image.
async function fetchPexelsPhoto(query: string): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&page=1`,
      { headers: { Authorization: key } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const photos = Array.isArray(data?.photos) ? data.photos : [];
    if (photos.length === 0) return null;
    const pick = photos[Math.floor(Math.random() * photos.length)];
    return pick?.src?.large2x || null;
  } catch {
    return null;
  }
}

// Paint the photo-template background: photo in the top zone (cover-cropped),
// a tangerine divider line, then the brand color band filling the rest. If
// the photo fetch or decode fails, the top zone fills with the band color so
// the canvas is never half-empty.
async function paintPhotoBackground(
  ctx: SKRSContext2D,
  templateType: ImageTemplateType,
  width: number,
  height: number
) {
  const bandColor = PHOTO_BAND_COLORS[templateType] ?? "#005C28";
  const query = PHOTO_QUERIES[templateType] ?? "";
  const photoH = PHOTO_ZONE_HEIGHT;

  let drewPhoto = false;
  const photoUrl = query ? await fetchPexelsPhoto(query) : null;
  if (photoUrl) {
    try {
      const res = await fetch(photoUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const img = await loadImage(buf);

        // Cover-crop math: clip the source so it fills width x photoH
        // without distortion.
        const destAspect = width / photoH;
        const srcAspect = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcAspect > destAspect) {
          sw = img.height * destAspect;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / destAspect;
          sy = (img.height - sh) / 2;
        }
        // Grayscale business/office photos; keep nature photos in color.
        // Reset filter to "none" regardless so the band and text below
        // aren't affected by canvas filter state.
        if (GRAYSCALE_TEMPLATES.includes(templateType)) {
          ctx.filter = "grayscale(100%)";
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, photoH);
        ctx.filter = "none";
        drewPhoto = true;
      }
    } catch {
      // fall through to fallback below
    }
  }

  if (!drewPhoto) {
    ctx.fillStyle = bandColor;
    ctx.fillRect(0, 0, width, photoH);
  }

  // Tangerine divider line between photo and band
  ctx.fillStyle = COLORS.tangerine;
  ctx.fillRect(0, photoH, width, 4);

  // Brand color band fills the rest of the canvas
  ctx.fillStyle = bandColor;
  ctx.fillRect(0, photoH + 4, width, height - photoH - 4);
}

async function drawLogo(
  ctx: SKRSContext2D,
  templateType: ImageTemplateType,
  canvasWidth: number,
  canvasHeight: number
) {
  const variant = DARK_BG_TEMPLATES.includes(templateType) ? "dark" : "light";
  const logoPath = path.join(process.cwd(), "public", LOGO_FILES[variant]);
  const logoData = readFileSync(logoPath);
  const logo = await loadImage(logoData);

  // Source PNGs are retina (2x); scaling to a fixed target height handles
  // both retina correction and visual consistency across the 4 platform
  // aspect ratios. When the source is exactly 2x the target, scale === 0.5.
  const scale = LOGO_HEIGHT / logo.height;
  const drawWidth = logo.width * scale;
  const drawHeight = LOGO_HEIGHT;

  const x = canvasWidth - drawWidth - LOGO_PADDING;
  const y = canvasHeight - drawHeight - LOGO_PADDING;
  ctx.drawImage(logo, x, y, drawWidth, drawHeight);
}

function renderStatCard(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, bodyText, statNumber, statLabel } = opts;
  const pad = 60;
  const textW = width - pad * 2;

  // Stat number — centered, upper portion of square canvas
  ctx.font = '120px "Jakarta ExtraBold"';
  ctx.fillStyle = COLORS.tangerine;
  const num = statNumber || "73%";
  const numWidth = ctx.measureText(num).width;
  ctx.fillText(num, (width - numWidth) / 2, 380);

  // Stat label — centered below number
  if (statLabel) {
    ctx.font = '40px "Open Sans SemiBold"';
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    const labelWidth = ctx.measureText(statLabel).width;
    ctx.fillText(statLabel, (width - labelWidth) / 2, 460);
  }

  // Headline — centered below the label
  ctx.font = '56px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 580;
  for (const line of headlineLines.slice(0, 3)) {
    const lw = ctx.measureText(line).width;
    ctx.fillText(line, (width - lw) / 2, yPos);
    yPos += 78;
  }

  // Supporting body text
  ctx.font = '38px "Open Sans"';
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const bodyLines = wrapText(ctx, bodyText, textW);
  yPos += 30;
  for (const line of bodyLines.slice(0, 3)) {
    const lw = ctx.measureText(line).width;
    ctx.fillText(line, (width - lw) / 2, yPos);
    yPos += 53;
  }
}

function renderQuoteCard(ctx: SKRSContext2D, opts: ImageOptions) {
  const { headline, bodyText } = opts;

  const pad = 80;
  const textW = 920;

  // Quote text — fills the upper 60% of the canvas
  ctx.font = '52px "Jakarta SemiBold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 240;
  for (const line of headlineLines.slice(0, 5)) {
    ctx.fillText(line, pad, yPos);
    yPos += 75;
  }

  // Attribution — below quote with 40px gap
  ctx.font = '34px "Open Sans"';
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  yPos += 40;
  const bodyLines = wrapText(ctx, bodyText, textW);
  for (const line of bodyLines.slice(0, 2)) {
    ctx.fillText(line, pad, yPos);
    yPos += 48;
  }
}

function renderTipGraphic(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, bodyText, category } = opts;
  // pad shifted to 200 to clear the template's left column band (0-160)
  const pad = 200;
  const textW = width - pad - 40;

  // Category pill badge
  if (category) {
    ctx.font = '26px "Jakarta SemiBold"';
    const pillText = category.toUpperCase();
    const pillWidth = ctx.measureText(pillText).width + 40;
    drawRoundedRect(ctx, pad, 160, pillWidth, 44, 22);
    ctx.fillStyle = COLORS.pillGreenBg;
    ctx.fill();
    ctx.fillStyle = COLORS.forestGreen;
    ctx.fillText(pillText, pad + 20, 192);
  }

  // Headline — 60px bold, dark forest green on the pale background
  ctx.font = '60px "Jakarta Bold"';
  ctx.fillStyle = COLORS.forestGreenDark;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 280;
  for (const line of headlineLines.slice(0, 4)) {
    ctx.fillText(line, pad, yPos);
    yPos += 84;
  }

  // Body — 38px charcoal, below headline with 40px gap
  ctx.font = '38px "Open Sans"';
  ctx.fillStyle = COLORS.charcoalLight;
  const bodyLines = wrapText(ctx, bodyText, textW);
  yPos += 40;
  for (const line of bodyLines.slice(0, 4)) {
    ctx.fillText(line, pad, yPos);
    yPos += 53;
  }
}

function renderComparison(ctx: SKRSContext2D, opts: ImageOptions) {
  const { headline, bodyText } = opts;
  // Columns laid out around the template's center divider at x=536-538
  const leftX = 60;
  const rightX = 560;
  const colW = 470;

  // Parse comparison data — headline is "before" content, bodyText may contain "|||" separator
  let beforeText = headline;
  let afterText = bodyText;

  // If bodyText contains "|||", split into before/after
  if (bodyText.includes("|||")) {
    const parts = bodyText.split("|||");
    beforeText = parts[0].trim();
    afterText = parts[1].trim();
  }

  // BEFORE / AFTER column labels in brand green
  ctx.fillStyle = COLORS.forestGreen;
  ctx.font = '36px "Jakarta Bold"';
  ctx.fillText("BEFORE", leftX, 220);
  ctx.fillText("AFTER", rightX, 220);

  // Left content
  const leftItems = beforeText.split("|").map(s => s.trim()).filter(Boolean);
  ctx.font = '38px "Jakarta SemiBold"';
  ctx.fillStyle = COLORS.charcoal;
  let leftY = 310;
  for (const item of leftItems.slice(0, 4)) {
    const lines = wrapText(ctx, item, colW);
    for (const line of lines) {
      ctx.fillText(line, leftX, leftY);
      leftY += 53;
    }
    leftY += 19;
  }

  // Right content
  const rightItems = afterText.split("|").map(s => s.trim()).filter(Boolean);
  ctx.font = '38px "Jakarta SemiBold"';
  ctx.fillStyle = COLORS.charcoal;
  let rightY = 310;
  for (const item of rightItems.slice(0, 4)) {
    const lines = wrapText(ctx, item, colW);
    for (const line of lines) {
      ctx.fillText(line, rightX, rightY);
      rightY += 53;
    }
    rightY += 19;
  }
}

function renderSavingsHighlight(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, bodyText, statNumber, statLabel } = opts;
  const pad = 80;
  const textW = width - pad * 2;

  // Dollar amount — centered, vertical anchor for the rest of the content
  ctx.font = '140px "Jakarta ExtraBold"';
  ctx.fillStyle = COLORS.tangerine;
  const amount = statNumber || "$4,200";
  const amountW = ctx.measureText(amount).width;
  ctx.fillText(amount, (width - amountW) / 2, 370);

  // Savings label — centered below
  if (statLabel) {
    ctx.font = '42px "Open Sans SemiBold"';
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    const labelW = ctx.measureText(statLabel).width;
    ctx.fillText(statLabel, (width - labelW) / 2, 440);
  }

  // Headline context — centered below
  ctx.font = '52px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 560;
  for (const line of headlineLines.slice(0, 2)) {
    const lw = ctx.measureText(line).width;
    ctx.fillText(line, (width - lw) / 2, yPos);
    yPos += 73;
  }

  // Body text
  ctx.font = '36px "Open Sans"';
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const bodyLines = wrapText(ctx, bodyText, textW);
  yPos += 30;
  for (const line of bodyLines.slice(0, 3)) {
    const lw = ctx.measureText(line).width;
    ctx.fillText(line, (width - lw) / 2, yPos);
    yPos += 50;
  }
}

function renderMythBuster(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, bodyText } = opts;
  const x = 80;
  const textW = width - x * 2;

  // MYTH pill — subtle red-tinted background with red label text
  drawRoundedRect(ctx, x, 140, 130, 48, 24);
  ctx.fillStyle = "rgba(239,68,68,0.15)";
  ctx.fill();
  ctx.font = '26px "Jakarta Bold"';
  ctx.fillStyle = COLORS.red;
  ctx.fillText("MYTH", x + 22, 175);

  // Myth text — dimmed white with strikethrough, filling ~35% of canvas
  ctx.font = '46px "Jakarta SemiBold"';
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  const mythLines = wrapText(ctx, headline, textW);
  let yPos = 270;
  const mythTextStartY = yPos;
  for (const line of mythLines.slice(0, 3)) {
    ctx.fillText(line, x, yPos);
    yPos += 64;
  }
  const mythTextEndY = yPos - 64;

  // Red strikethrough line through the myth text only
  ctx.strokeStyle = COLORS.red;
  ctx.lineWidth = 3;
  ctx.beginPath();
  const strikeY = mythTextStartY + (mythTextEndY - mythTextStartY) / 2 - 8;
  ctx.moveTo(x, strikeY);
  let maxMythWidth = 0;
  for (const line of mythLines.slice(0, 3)) {
    const w = ctx.measureText(line).width;
    if (w > maxMythWidth) maxMythWidth = w;
  }
  ctx.lineTo(x + maxMythWidth, strikeY);
  ctx.stroke();

  // REALITY pill — subtle green-tinted background with green label text
  drawRoundedRect(ctx, x, 580, 160, 48, 24);
  ctx.fillStyle = "rgba(31,168,85,0.2)";
  ctx.fill();
  ctx.font = '26px "Jakarta Bold"';
  ctx.fillStyle = COLORS.forestGreenLight;
  ctx.fillText("REALITY", x + 22, 615);

  // Reality text — full white, bold, filling ~35% of canvas
  ctx.font = '46px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  const realityLines = wrapText(ctx, bodyText, textW);
  yPos = 710;
  for (const line of realityLines.slice(0, 3)) {
    ctx.fillText(line, x, yPos);
    yPos += 64;
  }
}

function renderDidYouKnow(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, bodyText } = opts;
  const pad = 80;
  const textW = width - pad * 2;

  // "DID YOU KNOW?" category label in tangerine
  ctx.font = '28px "Jakarta Bold"';
  ctx.fillStyle = COLORS.tangerine;
  ctx.fillText("DID YOU KNOW?", pad, 200);

  // Main headline content — 64px bold white, generous line spacing
  ctx.font = '64px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 280;
  for (const line of headlineLines.slice(0, 4)) {
    ctx.fillText(line, pad, yPos);
    yPos += 90;
  }

  // Supporting body text
  ctx.font = '38px "Open Sans"';
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const bodyLines = wrapText(ctx, bodyText, textW);
  yPos += 30;
  for (const line of bodyLines.slice(0, 4)) {
    ctx.fillText(line, pad, yPos);
    yPos += 53;
  }
}

function renderChecklist(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, bodyText } = opts;
  // pad shifted to 200 to clear the template's left sidebar band (0-151)
  const pad = 200;
  const textW = width - pad - 80;

  // Title — 56px bold in dark forest green
  ctx.font = '56px "Jakarta Bold"';
  ctx.fillStyle = COLORS.forestGreenDark;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 180;
  for (const line of headlineLines.slice(0, 2)) {
    ctx.fillText(line, pad, yPos);
    yPos += 78;
  }

  // Checklist items — starting at Y: 150, spaced 68px apart
  const items = bodyText.split(/[|\n]/).map((s) => s.trim()).filter(Boolean);
  const startY = Math.max(yPos + 60, 360);
  yPos = startY;
  items.slice(0, 5).forEach((item, i) => {
    // The 4th item is highlighted in tangerine to match the orange checkbox
    // sitting in the template's sidebar at the same vertical position.
    const isHighlighted = i === 3;
    ctx.fillStyle = isHighlighted ? COLORS.tangerine : COLORS.forestGreen;
    ctx.font = '44px "Jakarta Bold"';
    ctx.fillText("\u2713", pad, yPos);
    ctx.fillStyle = isHighlighted ? COLORS.tangerine : COLORS.charcoal;
    ctx.font = '40px "Open Sans"';
    ctx.fillText(item, pad + 60, yPos);
    yPos += 90;
  });
}

// Photo template renderers — draw text on top of the photo+band background
// already painted by paintPhotoBackground(). The band starts at y=520+4=524.

function renderPhotoLandscape(ctx: SKRSContext2D, opts: ImageOptions) {
  const { headline, bodyText } = opts;
  const pad = 80;
  const textW = 920;

  // Quote/headline text
  ctx.font = '52px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 600;
  const lineH = 73; // 52 * 1.4
  for (const line of headlineLines.slice(0, 5)) {
    ctx.fillText(line, pad, yPos);
    yPos += lineH;
  }

  // Attribution
  if (bodyText) {
    ctx.font = '34px "Open Sans"';
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    yPos += 32 - lineH + 34; // account for last loop overshoot + ascender
    const attrLines = wrapText(ctx, bodyText, textW);
    for (const line of attrLines.slice(0, 2)) {
      ctx.fillText(line, pad, yPos);
      yPos += 48; // 34 * 1.4
    }
  }
}

function renderPhotoTip(ctx: SKRSContext2D, opts: ImageOptions) {
  const { headline, bodyText, category } = opts;
  const pad = 80;
  const textW = 880;

  // Category pill at top of the band
  ctx.font = '26px "Jakarta Bold"';
  const pillText = (category || "INDUSTRY TIP").toUpperCase();
  const pillTextW = ctx.measureText(pillText).width;
  const pillW = pillTextW + 40; // 20px padding on each side
  const pillH = 46; // ~10px padding above/below the text
  drawRoundedRect(ctx, pad, 536, pillW, pillH, 23);
  ctx.fillStyle = COLORS.pillGreenBg;
  ctx.fill();
  ctx.fillStyle = COLORS.forestGreen;
  ctx.fillText(pillText, pad + 20, 568);

  // Headline
  ctx.font = '56px "Jakarta Bold"';
  ctx.fillStyle = COLORS.forestGreenDark;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 660;
  const headlineLineH = 76; // 56 * 1.35
  for (const line of headlineLines.slice(0, 3)) {
    ctx.fillText(line, pad, yPos);
    yPos += headlineLineH;
  }

  // Body
  ctx.font = '36px "Open Sans"';
  ctx.fillStyle = COLORS.charcoalLight;
  const bodyLines = wrapText(ctx, bodyText, textW);
  yPos += 28 - headlineLineH + 36; // gap + first-line offset
  for (const line of bodyLines.slice(0, 3)) {
    ctx.fillText(line, pad, yPos);
    yPos += 54; // 36 * 1.5
  }

  // Bottom accent bar
  ctx.fillStyle = COLORS.tangerine;
  ctx.fillRect(pad, 1020, 160, 3);
}

function renderPhotoStat(ctx: SKRSContext2D, opts: ImageOptions) {
  const { width, headline, statNumber, statLabel } = opts;
  const pad = 80;
  const textW = 880;

  // Category label, left-aligned
  ctx.font = '26px "Jakarta Bold"';
  ctx.fillStyle = COLORS.tangerine;
  ctx.fillText("DID YOU KNOW?", pad, 568);

  // Big stat number, centered
  ctx.font = '120px "Jakarta ExtraBold"';
  ctx.fillStyle = COLORS.tangerine;
  const num = statNumber || "73%";
  const numW = ctx.measureText(num).width;
  ctx.fillText(num, (width - numW) / 2, 700);

  // Stat label, centered
  if (statLabel) {
    ctx.font = '38px "Open Sans"';
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    const labelW = ctx.measureText(statLabel).width;
    ctx.fillText(statLabel, (width - labelW) / 2, 790);
  }

  // Divider line
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(0, 830, width, 1);

  // Headline, centered
  ctx.font = '42px "Jakarta Bold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 890;
  for (const line of headlineLines.slice(0, 3)) {
    const lw = ctx.measureText(line).width;
    ctx.fillText(line, (width - lw) / 2, yPos);
    yPos += 57; // 42 * 1.35
  }
}

function renderPhotoQuote(ctx: SKRSContext2D, opts: ImageOptions) {
  const { headline, bodyText } = opts;
  const pad = 80;
  const textW = 900;

  // Quote text
  ctx.font = '50px "Jakarta SemiBold"';
  ctx.fillStyle = COLORS.white;
  const headlineLines = wrapText(ctx, headline, textW);
  let yPos = 640;
  const lineH = 73; // 50 * 1.45
  for (const line of headlineLines.slice(0, 4)) {
    ctx.fillText(line, pad, yPos);
    yPos += lineH;
  }

  // Attribution
  if (bodyText) {
    ctx.font = '32px "Open Sans"';
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    yPos += 32 - lineH + 32; // gap + first-line offset
    const attrLines = wrapText(ctx, bodyText, textW);
    for (const line of attrLines.slice(0, 2)) {
      ctx.fillText(line, pad, yPos);
      yPos += 45;
    }
  }

  // Tangerine accent bar
  ctx.fillStyle = COLORS.tangerine;
  ctx.fillRect(pad, 1020, 200, 3);
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
  photo_landscape: renderPhotoLandscape,
  photo_tip: renderPhotoTip,
  photo_stat: renderPhotoStat,
  photo_quote: renderPhotoQuote,
};

export async function generatePostImage(opts: ImageOptions): Promise<Buffer> {
  registerFonts();
  const canvas = createCanvas(opts.width, opts.height);
  const ctx = canvas.getContext("2d");

  // Background: photo templates fetch from Pexels + paint a band; the
  // canvas templates load their PNG background from disk.
  if (PHOTO_TEMPLATES.includes(opts.templateType)) {
    await paintPhotoBackground(ctx, opts.templateType, opts.width, opts.height);
  } else {
    await loadTemplateBackground(ctx, opts.templateType, opts.width, opts.height);
  }

  const renderer = RENDERERS[opts.templateType];
  if (!renderer) {
    throw new Error(`Unknown template type: ${opts.templateType}`);
  }

  renderer(ctx, opts);

  await drawLogo(ctx, opts.templateType, opts.width, opts.height);

  return canvas.toBuffer("image/png");
}
