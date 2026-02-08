import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { PublishResult } from "./types";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  // Try to get stored token first
  const supabase = getSupabase();
  const { data: tokenRow } = await supabase
    .from("platform_tokens")
    .select("*")
    .eq("platform", "google")
    .single();

  if (tokenRow?.access_token && tokenRow?.expires_at) {
    const expiresAt = new Date(tokenRow.expires_at);

    if (expiresAt > new Date()) {
      oauth2Client.setCredentials({
        access_token: tokenRow.access_token,
        refresh_token: tokenRow.refresh_token || process.env.GOOGLE_REFRESH_TOKEN,
      });
      return oauth2Client;
    }
  }

  // Use refresh token from env or DB
  const refreshToken =
    tokenRow?.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  // Force refresh
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();

    await supabase
      .from("platform_tokens")
      .update({
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token || refreshToken,
        expires_at: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("platform", "google");

    oauth2Client.setCredentials(credentials);
  } catch (error) {
    console.error("Google token refresh failed:", error);
    // Try with just the refresh token anyway
    oauth2Client.setCredentials({ refresh_token: refreshToken });
  }

  return oauth2Client;
}

export async function publish(
  content: string,
  imageUrl?: string
): Promise<PublishResult> {
  try {
    const auth = await getOAuth2Client();
    const locationId = process.env.GOOGLE_BUSINESS_LOCATION_ID!;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const postBody: any = {
      languageCode: "en",
      summary: content,
      topicType: "STANDARD",
      callToAction: {
        actionType: "LEARN_MORE",
        url: "https://www.insero.cloud",
      },
    };

    if (imageUrl) {
      postBody.media = [
        {
          mediaFormat: "PHOTO",
          sourceUrl: imageUrl,
        },
      ];
    }

    // Use the My Business API
    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${locationId}/localPosts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${(await auth.getAccessToken()).token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postBody),
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      return {
        success: false,
        error: `Google Business API error (${res.status}): ${errorText}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      postId: data.name || data.localPostId,
    };
  } catch (error) {
    return {
      success: false,
      error: `Google publish failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function testConnection(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const auth = await getOAuth2Client();
    const locationId = process.env.GOOGLE_BUSINESS_LOCATION_ID!;

    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${locationId}`,
      {
        headers: {
          Authorization: `Bearer ${(await auth.getAccessToken()).token}`,
        },
      }
    );

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        message: `Connected to: ${data.locationName || data.name || locationId}`,
      };
    }

    const errorText = await res.text();
    return {
      success: false,
      message: `Google Business error (${res.status}): ${errorText}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Google connection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
