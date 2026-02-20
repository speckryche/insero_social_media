import { createClient } from "@supabase/supabase-js";
import * as linkedin from "./linkedin";
import * as x from "./x";
import * as facebook from "./facebook";
import * as googleBusiness from "./google";
import { PublishResult } from "./types";

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
}

interface PublishAllResult {
  linkedin: PublishResult;
  x: PublishResult;
  facebook: PublishResult;
  google: PublishResult;
}

type Platform = "linkedin" | "x" | "facebook" | "google";

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

export async function publishPost(post: PostData): Promise<PublishAllResult> {
  const supabase = getSupabase();

  // Use platform-specific image URLs when available
  const linkedinImage = post.has_image && post.linkedin_image_url ? post.linkedin_image_url : (post.has_image && post.image_url ? post.image_url : undefined);
  const xImage = post.has_image && post.x_image_url ? post.x_image_url : (post.has_image && post.image_url ? post.image_url : undefined);
  const facebookImage = post.has_image && post.facebook_image_url ? post.facebook_image_url : (post.has_image && post.image_url ? post.image_url : undefined);
  const googleImage = post.has_image && post.google_image_url ? post.google_image_url : (post.has_image && post.image_url ? post.image_url : undefined);

  // Run all four publishers in parallel — failures are isolated
  const [linkedinResult, xResult, facebookResult, googleResult] =
    await Promise.all([
      linkedin.publish(post.linkedin_content, linkedinImage),
      x.publish(post.x_content, xImage),
      facebook.publish(post.facebook_content, facebookImage),
      googleBusiness.publish(post.google_content, googleImage),
    ]);

  // Log each result
  await Promise.all([
    logResult(post.id, "linkedin", linkedinResult),
    logResult(post.id, "x", xResult),
    logResult(post.id, "facebook", facebookResult),
    logResult(post.id, "google", googleResult),
  ]);

  // Build error log from any failures
  const errors: string[] = [];
  if (!linkedinResult.success) errors.push(`LinkedIn: ${linkedinResult.error}`);
  if (!xResult.success) errors.push(`X: ${xResult.error}`);
  if (!facebookResult.success) errors.push(`Facebook: ${facebookResult.error}`);
  if (!googleResult.success) errors.push(`Google: ${googleResult.error}`);

  const allSucceeded = errors.length === 0;

  // Update the post record in Supabase
  await supabase
    .from("posts")
    .update({
      linkedin_published: linkedinResult.success,
      x_published: xResult.success,
      facebook_published: facebookResult.success,
      google_published: googleResult.success,
      linkedin_post_id: linkedinResult.postId || null,
      x_post_id: xResult.postId || null,
      facebook_post_id: facebookResult.postId || null,
      google_post_id: googleResult.postId || null,
      status: allSucceeded ? "published" : "failed",
      published_at: allSucceeded ? new Date().toISOString() : null,
      error_log: errors.length > 0 ? errors.join("\n") : null,
    })
    .eq("id", post.id);

  return {
    linkedin: linkedinResult,
    x: xResult,
    facebook: facebookResult,
    google: googleResult,
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

  // Only retry platforms that failed
  const results: PublishAllResult = {
    linkedin: post.linkedin_published
      ? { success: true, postId: undefined }
      : await linkedin.publish(post.linkedin_content, linkedinImage),
    x: post.x_published
      ? { success: true, postId: undefined }
      : await x.publish(post.x_content, xImage),
    facebook: post.facebook_published
      ? { success: true, postId: undefined }
      : await facebook.publish(post.facebook_content, facebookImage),
    google: post.google_published
      ? { success: true, postId: undefined }
      : await googleBusiness.publish(post.google_content, googleImage),
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
