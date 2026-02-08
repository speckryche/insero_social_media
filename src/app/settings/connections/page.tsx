"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Plug,
} from "lucide-react";
import Link from "next/link";

interface PlatformStatus {
  tested: boolean;
  loading: boolean;
  success: boolean | null;
  message: string | null;
}

const PLATFORMS = [
  {
    key: "linkedin",
    name: "LinkedIn",
    description: "Post to your company page or personal profile via the LinkedIn Posts API.",
    color: "bg-blue-600",
  },
  {
    key: "x",
    name: "X (Twitter)",
    description: "Post tweets via the X API v2 with OAuth 1.0a authentication.",
    color: "bg-black",
  },
  {
    key: "facebook",
    name: "Facebook",
    description: "Post to your Facebook Page via the Meta Graph API.",
    color: "bg-blue-500",
  },
  {
    key: "google",
    name: "Google Business Profile",
    description: "Post local updates via the Google My Business API.",
    color: "bg-red-500",
  },
];

export default function ConnectionsPage() {
  const [statuses, setStatuses] = useState<Record<string, PlatformStatus>>({});

  async function testConnection(platform: string) {
    setStatuses((prev) => ({
      ...prev,
      [platform]: { tested: false, loading: true, success: null, message: null },
    }));

    try {
      const res = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });

      const data = await res.json();

      setStatuses((prev) => ({
        ...prev,
        [platform]: {
          tested: true,
          loading: false,
          success: data.success,
          message: data.message,
        },
      }));
    } catch (error) {
      setStatuses((prev) => ({
        ...prev,
        [platform]: {
          tested: true,
          loading: false,
          success: false,
          message: error instanceof Error ? error.message : "Connection failed",
        },
      }));
    }
  }

  async function testAll() {
    for (const platform of PLATFORMS) {
      await testConnection(platform.key);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Platform Connections
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Verify your API credentials are working
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={testAll}>
          <Plug className="h-4 w-4 mr-1.5" />
          Test All
        </Button>
      </div>

      <div className="space-y-4">
        {PLATFORMS.map((platform) => {
          const status = statuses[platform.key];

          return (
            <Card key={platform.key}>
              <CardHeader className="pb-2 px-5 pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        status?.tested
                          ? status.success
                            ? "bg-green-500"
                            : "bg-red-500"
                          : "bg-gray-300"
                      }`}
                    />
                    <CardTitle className="text-base">{platform.name}</CardTitle>
                    {status?.tested && (
                      <Badge
                        variant="outline"
                        className={
                          status.success
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }
                      >
                        {status.success ? (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        ) : (
                          <XCircle className="h-3 w-3 mr-1" />
                        )}
                        {status.success ? "Connected" : "Failed"}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection(platform.key)}
                    disabled={status?.loading}
                  >
                    {status?.loading ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Plug className="h-4 w-4 mr-1.5" />
                    )}
                    Test
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <p className="text-sm text-gray-500">{platform.description}</p>
                {status?.message && (
                  <p
                    className={`text-sm mt-2 p-2 rounded ${
                      status.success
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {status.message}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-4 px-5">
          <p className="text-sm text-amber-800">
            <strong>Note:</strong> Make sure all API keys and tokens are set in
            your <code className="bg-amber-100 px-1 rounded">.env.local</code>{" "}
            file before testing. LinkedIn tokens expire every 60 days — the app
            will attempt to auto-refresh them when they&apos;re within 7 days of
            expiration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
