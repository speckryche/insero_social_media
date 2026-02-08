import { TwitterApi } from "twitter-api-v2";
import { PublishResult } from "./types";

function getClient(): TwitterApi {
  return new TwitterApi({
    appKey: process.env.X_API_KEY!,
    appSecret: process.env.X_API_SECRET!,
    accessToken: process.env.X_ACCESS_TOKEN!,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
  });
}

export async function publish(
  content: string,
  imageUrl?: string
): Promise<PublishResult> {
  try {
    const client = getClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tweetParams: any = { text: content };

    // If we have an image, upload it first via v1 API
    if (imageUrl) {
      try {
        const imageRes = await fetch(imageUrl);
        if (imageRes.ok) {
          const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
          const v1Client = client.v1;
          const mediaId = await v1Client.uploadMedia(imageBuffer, {
            mimeType: "image/png",
          });
          tweetParams.media = { media_ids: [mediaId] };
        }
      } catch (imgError) {
        // Continue without image if upload fails
        console.error("X image upload failed:", imgError);
      }
    }

    const result = await client.v2.tweet(tweetParams);

    return {
      success: true,
      postId: result.data.id,
    };
  } catch (error) {
    return {
      success: false,
      error: `X publish failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function testConnection(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const client = getClient();
    const me = await client.v2.me();

    return {
      success: true,
      message: `Connected as @${me.data.username}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `X connection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
