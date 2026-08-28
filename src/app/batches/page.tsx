import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { GenerateBatchModal } from "@/components/generate-batch-modal";
import {
  BATCH_SCOPE_LABELS,
  BATCH_SCOPE_STYLES,
  batchScopeKey,
} from "@/lib/batch-scope";
import {
  batchLabel,
  legacyPeriodLabel,
  batchPeriodBadge,
  compareBatchesByPeriodDesc,
} from "@/lib/batch-period";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-blue-100 text-blue-800 border-blue-200",
  active: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-gray-100 text-gray-700 border-gray-200",
};

export const dynamic = "force-dynamic";

export default async function BatchesPage() {
  const supabase = createClient();

  const { data: rawBatches } = await supabase
    .from("batches")
    .select("*")
    .order("created_at", { ascending: false });

  // Newest week first, with the legacy monthly batches after them. Sorted here
  // rather than in the query because the two eras order on different columns.
  const batches = [...(rawBatches || [])].sort(compareBatchesByPeriodDesc);

  // Get approved counts for each batch
  const batchIds = batches?.map((b) => b.id) || [];
  let approvedCounts: Record<string, number> = {};

  if (batchIds.length > 0) {
    const { data: posts } = await supabase
      .from("posts")
      .select("batch_id, status")
      .in("batch_id", batchIds);

    if (posts) {
      approvedCounts = posts.reduce((acc: Record<string, number>, post) => {
        if (post.status === "approved" || post.status === "scheduled" || post.status === "published") {
          acc[post.batch_id] = (acc[post.batch_id] || 0) + 1;
        }
        return acc;
      }, {});
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Batches</h2>
        <GenerateBatchModal />
      </div>

      {batches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CalendarDays className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-gray-500 mb-1">No batches yet</p>
            <p className="text-sm text-gray-400">
              Generate your first batch to get started
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => {
            const approved = approvedCounts[batch.id] || 0;
            const badge = batchPeriodBadge(batch);
            return (
              <Link key={batch.id} href={`/batches/${batch.id}`}>
                <Card className="hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer">
                  <CardContent className="flex items-center justify-between py-4 px-5">
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col items-center justify-center w-14 h-14 rounded-lg bg-gray-50 border">
                        <span className="text-xs text-gray-400 uppercase leading-tight">
                          {badge.top}
                        </span>
                        <span className="text-lg font-bold text-gray-900">
                          {badge.bottom}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {batchLabel(batch)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {approved}/{batch.total_posts} approved &middot;{" "}
                          Created {new Date(batch.created_at).toLocaleDateString()}
                        </p>
                        {/* Legacy week/month batches keep their old period as
                            a secondary line so history stays readable. */}
                        {legacyPeriodLabel(batch) && (
                          <p className="text-xs text-gray-400">
                            {legacyPeriodLabel(batch)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        className={BATCH_SCOPE_STYLES[batchScopeKey(batch.scope)]}
                        variant="outline"
                      >
                        {BATCH_SCOPE_LABELS[batchScopeKey(batch.scope)]}
                      </Badge>
                      <Badge
                        className={STATUS_STYLES[batch.status] || ""}
                        variant="outline"
                      >
                        {batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
