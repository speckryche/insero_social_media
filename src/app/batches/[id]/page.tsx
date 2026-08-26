import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { BatchReview } from "@/components/batch-review";
import { parseEnabledPlatforms } from "@/lib/platforms";

export const dynamic = "force-dynamic";

export default async function BatchDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: batch } = await supabase
    .from("batches")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!batch) {
    notFound();
  }

  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .eq("batch_id", params.id)
    .order("post_number", { ascending: true });

  // Which platforms the review UI should show. Read here rather than in the
  // client so the tabs render correctly on first paint.
  const { data: settings } = await supabase
    .from("app_settings")
    .select("enabled_platforms")
    .single();

  return (
    <BatchReview
      initialBatch={batch}
      initialPosts={posts || []}
      enabledPlatforms={parseEnabledPlatforms(settings?.enabled_platforms)}
    />
  );
}
