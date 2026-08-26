// Which publishing platforms are switched on. This is a toggle, not a
// removal — every publisher, prompt rule, and UI panel still exists; a
// disabled platform is simply skipped everywhere.

export type Platform = "linkedin" | "x" | "facebook" | "google";

export const ALL_PLATFORMS: Platform[] = ["linkedin", "x", "facebook", "google"];

// The three that can actually be turned off. LinkedIn is the product.
export const OPTIONAL_PLATFORMS: Platform[] = ["x", "facebook", "google"];

export const DEFAULT_ENABLED_PLATFORMS: Platform[] = ["linkedin"];

export const PLATFORM_LABELS: Record<Platform, string> = {
  linkedin: "LinkedIn",
  x: "X (Twitter)",
  facebook: "Facebook",
  google: "Google Business Profile",
};

// The app_settings column is JSON and may be absent (before the migration
// runs), null, a string, or hold junk. Anything unusable falls back to the
// default, and LinkedIn is always forced on.
export function parseEnabledPlatforms(raw: unknown): Platform[] {
  let value = raw;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }

  if (!Array.isArray(value)) {
    return [...DEFAULT_ENABLED_PLATFORMS];
  }

  const selected = ALL_PLATFORMS.filter((platform) => value.includes(platform));

  if (!selected.includes("linkedin")) {
    selected.unshift("linkedin");
  }

  return selected;
}

export function isPlatformEnabled(
  enabled: Platform[],
  platform: Platform
): boolean {
  return enabled.includes(platform);
}
