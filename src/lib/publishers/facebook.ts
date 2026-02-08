import { PublishResult } from "./types";

const GRAPH_API_VERSION = "v19.0";

export async function publish(
  content: string,
  imageUrl?: string
): Promise<PublishResult> {
  try {
    const pageId = process.env.FACEBOOK_PAGE_ID!;
    const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN!;

    let res: Response;

    if (imageUrl) {
      // Post with image
      res = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/photos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caption: content,
            url: imageUrl,
            access_token: accessToken,
          }),
        }
      );
    } else {
      // Text-only post
      res = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/feed`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            access_token: accessToken,
          }),
        }
      );
    }

    const data = await res.json();

    if (data.error) {
      return {
        success: false,
        error: `Facebook API error: ${data.error.message}`,
      };
    }

    return {
      success: true,
      postId: data.id || data.post_id,
    };
  } catch (error) {
    return {
      success: false,
      error: `Facebook publish failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function testConnection(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const pageId = process.env.FACEBOOK_PAGE_ID!;
    const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN!;

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}?fields=name,id&access_token=${accessToken}`
    );

    const data = await res.json();

    if (data.error) {
      return {
        success: false,
        message: `Facebook error: ${data.error.message}`,
      };
    }

    return {
      success: true,
      message: `Connected to page: ${data.name}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Facebook connection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
