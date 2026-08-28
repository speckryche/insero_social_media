"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Layers,
  AlertTriangle,
  Loader2,
  ClipboardCheck,
} from "lucide-react";
import { GenerateBatchModal } from "@/components/generate-batch-modal";
import Link from "next/link";
import { batchPeriodLabel } from "@/lib/batch-period";

const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-blue-400",
  published: "bg-green-500",
  failed: "bg-red-500",
  approved: "bg-yellow-400",
  draft: "bg-gray-300",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DashboardData = any;

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard");
        if (res.ok) {
          setData(await res.json());
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  const batch = data?.activeBatch;
  const progress = data?.batchProgress;
  const stats = data?.stats;
  const nextPost = data?.nextPost;
  const failedPosts = data?.failedPosts || [];
  const calendarDays = data?.calendarDays || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Failed posts alert */}
      {failedPosts.length > 0 && batch && (
        <Link href={`/batches/${batch.id}`}>
          <Card className="border-red-200 bg-red-50 hover:border-red-300 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-3 py-3 px-5">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">
                  {failedPosts.length} post{failedPosts.length !== 1 ? "s" : ""}{" "}
                  failed to publish
                </p>
                <p className="text-xs text-red-600">
                  Click to view and retry failed posts
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Active Batch Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-medium text-gray-500">
            Active Batch
          </CardTitle>
          {batch ? (
            <Badge variant="default" className="bg-green-600">
              Active
            </Badge>
          ) : (
            <Badge variant="secondary">No Active Batch</Badge>
          )}
        </CardHeader>
        <CardContent>
          {batch ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Link
                  href={`/batches/${batch.id}`}
                  className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                >
                  {batchPeriodLabel(batch)}
                </Link>
                <span className="text-sm text-gray-500">
                  {progress?.published || 0}/{progress?.total || 0} published
                </span>
              </div>
              <Progress
                value={
                  progress
                    ? ((progress.published / progress.total) * 100)
                    : 0
                }
                className="h-2"
              />
              <div className="flex gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  {progress?.published || 0} published
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  {progress?.scheduled || 0} scheduled
                </span>
                {(progress?.failed || 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    {progress.failed} failed
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 text-center">
              <Layers className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-gray-500 mb-1">
                No batch is currently active
              </p>
              <p className="text-sm text-gray-400">
                Generate a new batch to start scheduling posts
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              This Month
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stats?.publishedThisMonth || 0}
            </p>
            <p className="text-xs text-gray-400 mt-1">Posts published</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              All Time
            </CardTitle>
            <CalendarDays className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stats?.publishedAllTime || 0}
            </p>
            <p className="text-xs text-gray-400 mt-1">Total published</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Next Post
            </CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            {nextPost ? (
              <>
                <p className="text-2xl font-bold">
                  {new Date(nextPost.scheduled_date + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <p className="text-xs text-gray-400 mt-1 capitalize">
                  #{nextPost.post_number} &middot; {nextPost.time_slot}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold">---</p>
                <p className="text-xs text-gray-400 mt-1">No upcoming posts</p>
              </>
            )}
          </CardContent>
        </Card>

        <Link href="/ready-to-post">
          <Card className="hover:border-violet-300 transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Personal Posts
              </CardTitle>
              <ClipboardCheck className="h-4 w-4 text-violet-500" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {stats?.personalPostedThisMonth || 0}
                <span className="text-sm font-normal text-gray-400">
                  /{stats?.personalTotalThisMonth || 0}
                </span>
              </p>
              <p className="text-xs text-gray-400 mt-1">Shared this month</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Calendar */}
      {calendarDays.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-gray-500">
              Schedule Calendar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1.5">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div
                  key={d}
                  className="text-xs font-medium text-gray-400 text-center pb-1"
                >
                  {d}
                </div>
              ))}
              {/* Pad start of month */}
              {calendarDays.length > 0 &&
                Array.from({
                  length: new Date(
                    calendarDays[0].date + "T00:00:00"
                  ).getDay(),
                }).map((_, i) => <div key={`pad-${i}`} />)}
              {calendarDays.map(
                (day: {
                  date: string;
                  morning: string | null;
                  afternoon: string | null;
                }) => {
                  const d = new Date(day.date + "T00:00:00");
                  const isToday =
                    day.date === new Date().toISOString().split("T")[0];
                  return (
                    <div
                      key={day.date}
                      className={`flex flex-col items-center p-1.5 rounded text-xs ${
                        isToday
                          ? "bg-blue-50 ring-1 ring-blue-300"
                          : "bg-gray-50"
                      }`}
                    >
                      <span
                        className={`font-medium ${
                          isToday ? "text-blue-700" : "text-gray-700"
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      <div className="flex gap-1 mt-1">
                        {day.morning && (
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              STATUS_DOT[day.morning] || "bg-gray-300"
                            }`}
                            title={`AM: ${day.morning}`}
                          />
                        )}
                        {day.afternoon && (
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              STATUS_DOT[day.afternoon] || "bg-gray-300"
                            }`}
                            title={`PM: ${day.afternoon}`}
                          />
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
            <div className="flex gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Published
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                Scheduled
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                Failed
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generate New Batch */}
      <div className="flex justify-center pt-2">
        <GenerateBatchModal />
      </div>
    </div>
  );
}
