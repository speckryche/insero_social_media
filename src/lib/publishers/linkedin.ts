import { createClient } from "@supabase/supabase-js";
import { PublishResult } from "./types";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getLinkedInVersion(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

async function getAccessToken(): Promise<string> {
  // Check if we have a stored token that needs refresh
  const supabase = getSupabase();
  const { data: tokenRow } = await supabase
    .from("platform_tokens")
    .select("*")
    .eq("platform", "linkedin")
    .single();

  if (tokenRow?.access_token && tokenRow?.expires_at) {
    const expiresAt = new Date(tokenRow.expires_at);
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // If token expires within 7 days, try to refresh
    if (expiresAt < sevenDaysFromNow && tokenRow.refresh_token) {
      const refreshed = await refreshLinkedInToken(tokenRow.refresh_token);
      if (refreshed) {
        return refreshed;
      }
    }

    // If token is still valid, use it
    if (expiresAt > new Date()) {
      return tokenRow.access_token;
    }
  }

  // Fall back to env var
  return process.env.LINKEDIN_ACCESS_TOKEN!;
}

async function refreshLinkedInToken(
  refreshToken: string
): Promise<string | null> {
  try {
    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }),
    });

    if (!res.ok) {
      console.error("LinkedIn token refresh failed:", await res.text());
      return null;
    }

    const data = await res.json();
    const supabase = getSupabase();

    await supabase
      .from("platform_tokens")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,
        expires_at: new Date(
          Date.now() + data.expires_in * 1000
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("platform", "linkedin");

    return data.access_token;
  } catch (error) {
    console.error("LinkedIn token refresh error:", error);
    return null;
  }
}

async function getAuthorUrn(): Promise<string> {
  const supabase = getSupabase();
  const { data: settings } = await supabase
    .from("app_settings")
    .select("linkedin_author_type")
    .single();

  if (settings?.linkedin_author_type === "person") {
    return `urn:li:person:${process.env.LINKEDIN_PERSON_URN}`;
  }
  return `urn:li:organization:${process.env.LINKEDIN_ORGANIZATION_ID}`;
}

export async function publish(
  content: string,
  imageUrl?: string
): Promise<PublishResult> {
  try {
    const accessToken = await getAccessToken();
    const authorUrn = await getAuthorUrn();
    const version = getLinkedInVersion();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": version,
    };

    // Build the post body
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = {
      author: authorUrn,
      commentary: content,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };

    // If we have an image, upload it first
    if (imageUrl) {
      const imageUrn = await uploadLinkedInImage(
        accessToken,
        authorUrn,
        imageUrl,
        version
      );
      if (imageUrn) {
        body.content = {
          media: {
            altText: "Insero Social Hub post image",
            id: imageUrn,
          },
        };
      }
    }

    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { success: false, error: `LinkedIn API error (${res.status}): ${errorText}` };
    }

    // LinkedIn returns the post ID in the x-restli-id header
    const postId = res.headers.get("x-restli-id") || undefined;
    return { success: true, postId };
  } catch (error) {
    return {
      success: false,
      error: `LinkedIn publish failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function uploadLinkedInImage(
  accessToken: string,
  authorUrn: string,
  imageUrl: string,
  version: string
): Promise<string | null> {
  try {
    // Step 1: Initialize upload
    const initRes = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": version,
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn,
        },
      }),
    });

    if (!initRes.ok) return null;

    const initData = await initRes.json();
    const uploadUrl = initData.value.uploadUrl;
    const imageUrn = initData.value.image;

    // Step 2: Download the image
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) return null;
    const imageBuffer = await imageRes.arrayBuffer();

    // Step 3: Upload to LinkedIn
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: imageBuffer,
    });

    if (!uploadRes.ok) return null;

    return imageUrn;
  } catch {
    return null;
  }
}

export async function publishAsPersonal(
  content: string,
  imageUrl?: string
): Promise<PublishResult> {
  try {
    const accessToken = await getAccessToken();
    const personUrn = `urn:li:person:${process.env.LINKEDIN_PERSON_URN}`;
    const version = getLinkedInVersion();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": version,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = {
      author: personUrn,
      commentary: content,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };

    if (imageUrl) {
      const imageUrn = await uploadLinkedInImage(
        accessToken,
        personUrn,
        imageUrl,
        version
      );
      if (imageUrn) {
        body.content = {
          media: {
            altText: "Insero Social Hub post image",
            id: imageUrn,
          },
        };
      }
    }

    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { success: false, error: `LinkedIn Personal API error (${res.status}): ${errorText}` };
    }

    const postId = res.headers.get("x-restli-id") || undefined;
    return { success: true, postId };
  } catch (error) {
    return {
      success: false,
      error: `LinkedIn Personal publish failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function testConnection(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const accessToken = await getAccessToken();
    const version = getLinkedInVersion();

    const res = await fetch(
      `https://api.linkedin.com/rest/organizationsLookup?ids=List(${process.env.LINKEDIN_ORGANIZATION_ID})`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
          "LinkedIn-Version": version,
        },
      }
    );

    if (res.ok) {
      return { success: true, message: "Connected to LinkedIn" };
    }

    const errorText = await res.text();
    return {
      success: false,
      message: `LinkedIn error (${res.status}): ${errorText}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `LinkedIn connection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function getTokenStatus(): Promise<{
  hasToken: boolean;
  expiresAt: string | null;
  needsRefresh: boolean;
}> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("platform_tokens")
    .select("access_token, expires_at")
    .eq("platform", "linkedin")
    .single();

  if (!data?.access_token) {
    return { hasToken: false, expiresAt: null, needsRefresh: true };
  }

  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return {
    hasToken: true,
    expiresAt: data.expires_at,
    needsRefresh: expiresAt ? expiresAt < sevenDaysFromNow : false,
  };
}
