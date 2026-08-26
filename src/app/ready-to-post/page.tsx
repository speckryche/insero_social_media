"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2,
  Copy,
  Loader2,
  ClipboardCheck,
} from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  ai_speak: "AI Speak",
  tech_speak: "Tech Speak",
  quote_speak: "Quote Speak",
  cost_speak: "Cost Speak",
  humor_speak: "Humor Speak",
  personal_take: "Personal Take",
  // Legacy categories — kept so posts from earlier batches still render a
  // label. Not offered in any picker.
  bill_speak: "Bill Speak",
  contract_speak: "Contract Speak",
  did_you_know: "Did You Know",
  savings_story: "Savings Story",
  industry_tip: "Industry Tip",
  myth_busting: "Myth Busting",
};

const CATEGORY_STYLES: Record<string, string> = {
  ai_speak: "bg-indigo-100 text-indigo-800",
  tech_speak: "bg-amber-100 text-amber-800",
  quote_speak: "bg-emerald-100 text-emerald-800",
  cost_speak: "bg-rose-100 text-rose-800",
  humor_speak: "bg-orange-100 text-orange-800",
  personal_take: "bg-violet-100 text-violet-800",
  // Legacy categories — see note above.
  bill_speak: "bg-sky-100 text-sky-800",
  contract_speak: "bg-rose-100 text-rose-800",
  did_you_know: "bg-sky-100 text-sky-800",
  savings_story: "bg-emerald-100 text-emerald-800",
  industry_tip: "bg-amber-100 text-amber-800",
  myth_busting: "bg-rose-100 text-rose-800",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Post = any;

export default function ReadyToPostPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState({ posted: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/ready-to-post");
        if (res.ok) {
          const data = await res.json();
          setPosts(data.posts || []);
          setStats(data.stats || { posted: 0, total: 0 });
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredPosts = useMemo(() => {
    if (filter === "posted") return posts.filter((p) => p.linkedin_personal_published);
    if (filter === "not-posted") return posts.filter((p) => !p.linkedin_personal_published);
    return posts;
  }, [posts, filter]);

  async function handleCopy(content: string, postId: string) {
    await navigator.clipboard.writeText(content);
    setCopiedId(postId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleMarkAsPosted(postId: string) {
    setMarkingId(postId);
    try {
      const res = await fetch("/api/ready-to-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      if (res.ok) {
        setPosts(posts.map((p) =>
          p.id === postId ? { ...p, linkedin_personal_published: true } : p
        ));
        setStats((s) => ({ ...s, posted: s.posted + 1 }));
      }
    } finally {
      setMarkingId(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Ready to Post</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Personal LinkedIn posts approved for manual sharing
          </p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">
          {stats.posted} of {stats.total} shared this month
        </Badge>
      </div>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="grid w-full grid-cols-3 h-9">
          <TabsTrigger value="all" className="text-xs">All ({posts.length})</TabsTrigger>
          <TabsTrigger value="not-posted" className="text-xs">
            Not Yet Posted ({posts.filter((p) => !p.linkedin_personal_published).length})
          </TabsTrigger>
          <TabsTrigger value="posted" className="text-xs">
            Posted ({posts.filter((p) => p.linkedin_personal_published).length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {filteredPosts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center">
            <ClipboardCheck className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-gray-500">No personal posts to show</p>
            <p className="text-sm text-gray-400 mt-1">
              {filter === "not-posted"
                ? "All personal posts have been shared!"
                : "Approve personal posts in batch review to see them here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredPosts.map((post) => (
            <Card key={post.id} className={post.linkedin_personal_published ? "opacity-60" : ""}>
              <CardHeader className="pb-2 px-5 pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      #{post.post_number}
                    </span>
                    <span className="text-sm text-gray-500">
                      {new Date(post.scheduled_date + "T00:00:00").toLocaleDateString(
                        "en-US",
                        { weekday: "short", month: "short", day: "numeric" }
                      )}
                    </span>
                    <Badge variant="outline" className="text-xs capitalize">
                      {post.time_slot}
                    </Badge>
                    <Badge className={`text-xs ${CATEGORY_STYLES[post.content_category] || ""}`}>
                      {CATEGORY_LABELS[post.content_category] || post.content_category}
                    </Badge>
                  </div>
                  {post.linkedin_personal_published && (
                    <Badge className="bg-green-100 text-green-800 text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Posted
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <p className="text-sm text-gray-700 whitespace-pre-line mb-3">
                  {post.linkedin_personal_content}
                </p>

                {post.linkedin_personal_image_url && (
                  <img
                    src={post.linkedin_personal_image_url}
                    alt="Post image"
                    className="w-full max-w-md rounded border mb-3"
                  />
                )}

                {!post.linkedin_personal_published && (
                  <div className="flex items-center gap-2 pt-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleCopy(post.linkedin_personal_content, post.id)}
                    >
                      {copiedId === post.id ? (
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-green-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 mr-1" />
                      )}
                      {copiedId === post.id ? "Copied!" : "Copy to Clipboard"}
                    </Button>
                    <Button
                      size="sm"
                      className="text-xs bg-green-600 hover:bg-green-700"
                      onClick={() => handleMarkAsPosted(post.id)}
                      disabled={markingId === post.id}
                    >
                      {markingId === post.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      )}
                      Mark as Posted
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
