"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  ScrollText,
} from "lucide-react";

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
  google: "Google",
};

const SCOPE_LABELS: Record<string, string> = {
  company: "Company",
  personal: "Personal",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogEntry = any;

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchLogs() {
    setLoading(true);
    try {
      const res = await fetch("/api/logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Publishing Log
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Last 50 publishing events
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1.5" />
          )}
          Refresh
        </Button>
      </div>

      {loading && logs.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
          </CardContent>
        </Card>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <ScrollText className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-gray-500 mb-1">No publishing activity yet</p>
            <p className="text-sm text-gray-400">
              Logs will appear here once posts start publishing
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-sm font-medium text-gray-500">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="divide-y">
              {logs.map((log: LogEntry) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="flex items-center gap-3">
                    {log.status === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          Post #{log.posts?.post_number || "?"}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-xs capitalize"
                        >
                          {PLATFORM_LABELS[log.platform] || log.platform}
                          {/* LinkedIn has two destinations; older rows and the
                              other platforms carry no scope and read as before. */}
                          {log.scope ? ` · ${SCOPE_LABELS[log.scope] || log.scope}` : ""}
                        </Badge>
                        <Badge
                          className={`text-xs ${
                            log.status === "success"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {log.status}
                        </Badge>
                        {/* Posted by hand, outside the app. Neutral styling —
                            it is not a failure. */}
                        {log.source === "manual" && (
                          <Badge
                            variant="outline"
                            className="text-xs border-gray-300 text-gray-600"
                          >
                            Manual
                          </Badge>
                        )}
                      </div>
                      {log.error_message && (
                        <p className="text-xs text-red-600 mt-0.5 max-w-md truncate">
                          {log.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
