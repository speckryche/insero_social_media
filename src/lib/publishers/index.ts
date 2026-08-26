import { createClient } from "@supabase/supabase-js";
import * as linkedin from "./linkedin";
import * as x from "./x";
import * as facebook from "./facebook";
import * as googleBusiness from "./google";
import { PublishResult } from "./types";
import {
  OPTIONAL_PLATFORMS,
  parseEnabledPlatforms,
  type Platform,
} from "@/lib/platforms";

export type { PublishResult };

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface PostData {
  id: string;
  linkedin_content: string;
  linkedin_personal_content?: string;
  x_content: string;
  facebook_content: string;
  google_content: string;
  image_url?: string | null;
  linkedin_image_url?: string | null;
  x_image_url?: string | null;
  facebook_image_url?: string | null;
  google_image_url?: string | null;
  linkedin_personal_image_url?: string | null;
  has_image: boolean;
  linkedin_personal_approved?: boolean;
  linkedin_company_approved?: boolean;
}

interface PublishAllResult {
  linkedin: PublishResult;
  x: PublishResult;
  facebook: PublishResult;
  google: PublishResult;
}

// Return shape for the LinkedIn-only publishPost flow. Keys are present only
// for variants that were actually attempted (gated by the per-platform
// approval flags). X / Facebook / Google are skipped entirely for now until
// their credentials are configured.
export interface PublishPostResult {
  linkedin?: PublishResult;
  linkedin_personal?: PublishResult;
}

// Platform is imported from @/lib/platforms — same union, single source.

async function logResult(
  postId: string,
  platform: Platform,
  result: PublishResult
) {
  const supabase = getSupabase();
  await supabase.from("publish_logs").insert({
    post_id: postId,
    platform,
    status: result.success ? "success" : "failed",
    post_id_returned: result.postId || null,
    error_message: result.error || null,
  });
}


// Reads the enabled-platform toggle. Nothing here removes a publisher — a
// disabled platform is skipped and logged, and flipping it back on in
// Settings restores it with no code change.
async function getEnabledPlatforms(): Promise<Platform[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("app_settings")
    .select("enabled_platforms")
    .single();
  return parseEnabledPlatforms(data?.enabled_platforms);
}

function logSkippedPlatforms(context: string, enabled: Platform[]) {
  const skipped = OPTIONAL_PLATFORMS.filter((p) => !enabled.includes(p));
  if (skipped.length > 0) {
    console.log(
      `[${context}] skipping disabled platforms: ${skipped.join(", ")} ` +
      `(enable them in Settings > Enabled Platforms)`
    );
  }
}

export async function publishPost(post: PostData): Promise<PublishPostResult> {
  const supabase = getSupabase();

  const wantsCompany = post.linkedin_company_approved === true;
  const wantsPersonal =
    post.linkedin_personal_approved === true &&
    !!post.linkedin_personal_content;

  // Nothing approved — leave the post row untouched and let the caller handle.
  if (!wantsCompany && !wantsPersonal) {
    return {};
  }

  // Per-platform image URLs with a fallback to the legacy image_url column.
  const companyImage = post.has_image
    ? post.linkedin_image_url || post.image_url || undefined
    : undefined;
  const personalImage = post.has_image
    ? post.linkedin_personal_image_url || undefined
    : undefined;

  // Log what's firing so the dev server output makes it obvious which
  // variants are being attempted and which are being skipped.
  console.log(
    `[publishPost] post=${post.id} wantsCompany=${wantsCompany} wantsPersonal=${wantsPersonal}`
  );
  logSkippedPlatforms("publishPost", await getEnabledPlatforms());

  // Run the two LinkedIn variants in parallel — failures are isolated. X,
  // Facebook, and Google publishers are not called at all in this build.
  const [companyResult, personalResult] = await Promise.all([
    wantsCompany
      ? linkedin.publish(post.linkedin_content, companyImage)
      : Promise.resolve<PublishResult | undefined>(undefined),
    wantsPersonal
      ? linkedin.publishAsPersonal(post.linkedin_personal_content!, personalImage)
      : Promise.resolve<PublishResult | undefined>(undefined),
  ]);

  if (companyResult) {
    console.log(
      `[publishPost] company result: success=${companyResult.success}` +
      (companyResult.error ? ` error="${companyResult.error.slice(0, 200)}"` : "") +
      (companyResult.postId ? ` postId=${companyResult.postId}` : "")
    );
  }
  if (personalResult) {
    console.log(
      `[publishPost] personal result: success=${personalResult.success}` +
      (personalResult.error ? ` error="${personalResult.error.slice(0, 200)}"` : "") +
      (personalResult.postId ? ` postId=${personalResult.postId}` : "")
    );
  }

  // Log to publish_logs. The CHECK on publish_logs.platform only allows the
  // four legacy platforms, so the personal variant is folded into "linkedin"
  // here (consistent with how publishPersonalPost behaves: it doesn't write
  // a separate log row).
  if (companyResult) {
    await logResult(post.id, "linkedin", companyResult);
  }

  // Distinguish "expected" company failures from real ones. Until we have
  // the Marketing Developer Platform (`w_organization_social`) product on
  // the LinkedIn app, posting to the org URN with a member-context token
  // returns 403 — that's a known limitation, not a publish failure. So we
  // only treat the company result as a blocking failure if it failed with a
  // non-403 status, OR if no personal call was attempted to fall back on.
  const companyFailed = !!(companyResult && !companyResult.success);
  const companyIs403 =
    companyFailed && /\b(?:403|ACCESS_DENIED|Not enough permissions)\b/.test(companyResult!.error || "");
  const personalFailed = !!(personalResult && !personalResult.success);

  // Blocking failure = anything that should mark the post as failed.
  const companyBlocking = companyFailed && !(companyIs403 && wantsPersonal);
  const blocking = companyBlocking || personalFailed;

  // Error log still records every failure verbatim so it's visible in the
  // batch review UI's red "failed" panel — even the expected 403s.
  const errors: string[] = [];
  if (companyResult && !companyResult.success) {
    errors.push(`LinkedIn company: ${companyResult.error}`);
  }
  if (personalResult && !personalResult.success) {
    errors.push(`LinkedIn personal: ${personalResult.error}`);
  }

  if (companyIs403 && wantsPersonal) {
    console.log(
      "[publishPost] company 403 treated as expected/skipped — personal path decides post status"
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = {
    status: blocking ? "failed" : "published",
    error_log: errors.length > 0 ? errors.join("\n") : null,
  };
  if (!blocking) {
    update.published_at = new Date().toISOString();
  }
  if (companyResult) {
    update.linkedin_published = companyResult.success;
    update.linkedin_post_id = companyResult.postId || null;
  }
  if (personalResult) {
    update.linkedin_personal_published = personalResult.success;
    update.linkedin_personal_post_id = personalResult.postId || null;
  }

  await supabase.from("posts").update(update).eq("id", post.id);

  return {
    linkedin: companyResult,
    linkedin_personal: personalResult,
  };
}

export async function publishPersonalPost(post: PostData): Promise<PublishResult> {
  if (!post.linkedin_personal_content) {
    return { success: false, error: "No personal content" };
  }

  const supabase = getSupabase();
  const personalImage = post.has_image && post.linkedin_personal_image_url
    ? post.linkedin_personal_image_url
    : undefined;

  try {
    // Publish using personal profile — the LinkedIn publisher uses getAuthorUrn
    // which checks settings, but for personal posts we need to force person URN
    const result = await linkedin.publishAsPersonal(post.linkedin_personal_content, personalImage);

    // Update personal post fields
    await supabase
      .from("posts")
      .update({
        linkedin_personal_published: result.success,
        linkedin_personal_post_id: result.postId || null,
      })
      .eq("id", post.id);

    return result;
  } catch (error) {
    return {
      success: false,
      error: `Personal publish failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function retryFailedPlatforms(
  post: PostData & {
    linkedin_published: boolean;
    x_published: boolean;
    facebook_published: boolean;
    google_published: boolean;
  }
): Promise<PublishAllResult> {
  const supabase = getSupabase();

  const linkedinImage = post.has_image && post.linkedin_image_url ? post.linkedin_image_url : (post.has_image && post.image_url ? post.image_url : undefined);
  const xImage = post.has_image && post.x_image_url ? post.x_image_url : (post.has_image && post.image_url ? post.image_url : undefined);
  const facebookImage = post.has_image && post.facebook_image_url ? post.facebook_image_url : (post.has_image && post.image_url ? post.image_url : undefined);
  const googleImage = post.has_image && post.google_image_url ? post.google_image_url : (post.has_image && post.image_url ? post.image_url : undefined);

  // Only retry platforms that failed — and only ones that are switched on.
  // A disabled platform reports success so it neither blocks the post nor
  // gets marked failed; the publisher itself is untouched and comes straight
  // back when the toggle is flipped in Settings.
  const enabled = await getEnabledPlatforms();
  logSkippedPlatforms("retryFailedPlatforms", enabled);

  const skipDisabled = (platform: Platform): PublishResult | null =>
    enabled.includes(platform) ? null : { success: true, postId: undefined };

  const results: PublishAllResult = {
    linkedin: post.linkedin_published
      ? { success: true, postId: undefined }
      : await linkedin.publish(post.linkedin_content, linkedinImage),
    x:
      skipDisabled("x") ??
      (post.x_published
        ? { success: true, postId: undefined }
        : await x.publish(post.x_content, xImage)),
    facebook:
      skipDisabled("facebook") ??
      (post.facebook_published
        ? { success: true, postId: undefined }
        : await facebook.publish(post.facebook_content, facebookImage)),
    google:
      skipDisabled("google") ??
      (post.google_published
        ? { success: true, postId: undefined }
        : await googleBusiness.publish(post.google_content, googleImage)),
  };

  // Log retried platforms
  const logPromises: Promise<void>[] = [];
  if (!post.linkedin_published)
    logPromises.push(logResult(post.id, "linkedin", results.linkedin));
  if (!post.x_published)
    logPromises.push(logResult(post.id, "x", results.x));
  if (!post.facebook_published)
    logPromises.push(logResult(post.id, "facebook", results.facebook));
  if (!post.google_published)
    logPromises.push(logResult(post.id, "google", results.google));
  await Promise.all(logPromises);

  const errors: string[] = [];
  if (!results.linkedin.success && !post.linkedin_published)
    errors.push(`LinkedIn: ${results.linkedin.error}`);
  if (!results.x.success && !post.x_published)
    errors.push(`X: ${results.x.error}`);
  if (!results.facebook.success && !post.facebook_published)
    errors.push(`Facebook: ${results.facebook.error}`);
  if (!results.google.success && !post.google_published)
    errors.push(`Google: ${results.google.error}`);

  const allNowSucceeded =
    (results.linkedin.success || post.linkedin_published) &&
    (results.x.success || post.x_published) &&
    (results.facebook.success || post.facebook_published) &&
    (results.google.success || post.google_published);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = {
    linkedin_published: results.linkedin.success || post.linkedin_published,
    x_published: results.x.success || post.x_published,
    facebook_published: results.facebook.success || post.facebook_published,
    google_published: results.google.success || post.google_published,
    status: allNowSucceeded ? "published" : "failed",
    error_log: errors.length > 0 ? errors.join("\n") : null,
  };

  if (allNowSucceeded) update.published_at = new Date().toISOString();
  if (results.linkedin.postId) update.linkedin_post_id = results.linkedin.postId;
  if (results.x.postId) update.x_post_id = results.x.postId;
  if (results.facebook.postId) update.facebook_post_id = results.facebook.postId;
  if (results.google.postId) update.google_post_id = results.google.postId;

  await supabase.from("posts").update(update).eq("id", post.id);

  return results;
}

export async function testAllConnections(): Promise<
  Record<string, { success: boolean; message: string }>
> {
  const [linkedinResult, xResult, facebookResult, googleResult] =
    await Promise.all([
      linkedin.testConnection(),
      x.testConnection(),
      facebook.testConnection(),
      googleBusiness.testConnection(),
    ]);

  return {
    linkedin: linkedinResult,
    x: xResult,
    facebook: facebookResult,
    google: googleResult,
  };
}
