"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  Edit3,
  RefreshCw,
  Image as ImageIcon,
  Loader2,
  ArrowLeft,
  Play,
  CheckCheck,
  Send,
  RotateCcw,
  XCircle,
  AlertTriangle,
  Eye,
  Trash2,
  Pause,
  Building2,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PostEditSheet } from "@/components/post-edit-sheet";
import { PostPreviewModal } from "@/components/post-preview-modal";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  edited: "bg-purple-100 text-purple-800",
  approved: "bg-green-100 text-green-800",
  scheduled: "bg-blue-100 text-blue-800",
  published: "bg-gray-100 text-gray-700",
  failed: "bg-red-100 text-red-800",
};

const BATCH_STATUS_STYLES: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-blue-100 text-blue-800 border-blue-200",
  active: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-gray-100 text-gray-700 border-gray-200",
};

const CATEGORY_STYLES: Record<string, string> = {
  did_you_know: "bg-sky-100 text-sky-800",
  savings_story: "bg-emerald-100 text-emerald-800",
  industry_tip: "bg-amber-100 text-amber-800",
  myth_busting: "bg-rose-100 text-rose-800",
  personal_take: "bg-violet-100 text-violet-800",
};

const CATEGORY_LABELS: Record<string, string> = {
  did_you_know: "Did You Know",
  savings_story: "Savings Story",
  industry_tip: "Industry Tip",
  myth_busting: "Myth Busting",
  personal_take: "Personal Take",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Post = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Batch = any;

interface BatchReviewProps {
  initialBatch: Batch;
  initialPosts: Post[];
}

function getWeekNumber(dateStr: string): number {
  const date = new Date(dateStr + "T00:00:00");
  const dayOfMonth = date.getDate();
  if (dayOfMonth <= 7) return 1;
  if (dayOfMonth <= 14) return 2;
  if (dayOfMonth <= 21) return 3;
  return 4;
}

export function BatchReview({ initialBatch, initialPosts }: BatchReviewProps) {
  const router = useRouter();
  const [batch, setBatch] = useState<Batch>(initialBatch);
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("all");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [previewingPost, setPreviewingPost] = useState<Post | null>(null);
  const [regeneratingImageId, setRegeneratingImageId] = useState<string | null>(null);

  const approvedCount = posts.filter(
    (p) => p.status === "approved" || p.status === "scheduled" || p.status === "published"
  ).length;
  const approvalPercent = Math.round((approvedCount / posts.length) * 100);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (categoryFilter !== "all" && post.content_category !== categoryFilter)
        return false;
      if (statusFilter !== "all" && post.status !== statusFilter) return false;
      if (weekFilter !== "all") {
        const week = getWeekNumber(post.scheduled_date);
        if (String(week) !== weekFilter) return false;
      }
      return true;
    });
  }, [posts, categoryFilter, statusFilter, weekFilter]);

  async function handleApproveAll() {
    setLoadingAction("approve-all");
    try {
      const res = await fetch(`/api/batches/${batch.id}/approve-all`, {
        method: "POST",
      });
      if (res.ok) {
        const updatedBatch = await res.json();
        setBatch(updatedBatch);
        setPosts(posts.map((p) => ({
          ...p,
          status: "approved",
          linkedin_company_approved: true,
          linkedin_personal_approved: true,
        })));
      }
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleApproveCompany() {
    setLoadingAction("approve-company");
    try {
      const res = await fetch(`/api/batches/${batch.id}/approve-company`, {
        method: "POST",
      });
      if (res.ok) {
        setPosts(posts.map((p) => ({ ...p, linkedin_company_approved: true })));
      }
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleApprovePersonal() {
    setLoadingAction("approve-personal");
    try {
      const res = await fetch(`/api/batches/${batch.id}/approve-personal`, {
        method: "POST",
      });
      if (res.ok) {
        setPosts(posts.map((p) => ({ ...p, linkedin_personal_approved: true })));
      }
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleApproveRemaining() {
    setLoadingAction("approve-remaining");
    try {
      const res = await fetch(`/api/batches/${batch.id}/approve-remaining`, {
        method: "POST",
      });
      if (res.ok) {
        const updatedBatch = await res.json();
        setBatch(updatedBatch);
        setPosts(
          posts.map((p) =>
            p.status === "draft" || p.status === "edited"
              ? {
                  ...p,
                  status: "approved",
                  linkedin_company_approved: true,
                  linkedin_personal_approved: true,
                }
              : p
          )
        );
      }
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleActivate() {
    setLoadingAction("activate");
    try {
      const res = await fetch(`/api/batches/${batch.id}/activate`, {
        method: "POST",
      });
      if (res.ok) {
        const updatedBatch = await res.json();
        setBatch(updatedBatch);
        setPosts(
          posts.map((p) =>
            p.status === "approved" ? { ...p, status: "scheduled" } : p
          )
        );
      }
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleToggleApprove(postId: string, type?: "personal" | "company") {
    const res = await fetch(`/api/posts/${postId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPosts(posts.map((p) => (p.id === postId ? updated : p)));
    }
  }

  async function handleRegenerate(postId: string) {
    setRegeneratingId(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/regenerate`, {
        method: "POST",
      });
      if (res.ok) {
        const updated = await res.json();
        setPosts(posts.map((p) => (p.id === postId ? updated : p)));
      }
    } finally {
      setRegeneratingId(null);
    }
  }

  async function handleRegenerateImage(postId: string) {
    setRegeneratingImageId(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/regenerate-image`, {
        method: "POST",
      });
      if (res.ok) {
        const updated = await res.json();
        setPosts(posts.map((p) => (p.id === postId ? updated : p)));
      }
    } finally {
      setRegeneratingImageId(null);
    }
  }

  function handlePostSaved(updatedPost: Post) {
    setPosts(posts.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
    setEditingPost(null);
  }

  async function handlePublishNow(postId: string) {
    setPublishingId(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/publish`, {
        method: "POST",
      });
      if (res.ok) {
        const { post: updated } = await res.json();
        setPosts(posts.map((p) => (p.id === postId ? updated : p)));
      }
    } finally {
      setPublishingId(null);
    }
  }

  async function handleRetry(postId: string) {
    setRetryingId(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/retry`, {
        method: "POST",
      });
      if (res.ok) {
        const { post: updated } = await res.json();
        setPosts(posts.map((p) => (p.id === postId ? updated : p)));
      }
    } finally {
      setRetryingId(null);
    }
  }

  async function handleDeactivate() {
    setLoadingAction("deactivate");
    try {
      const res = await fetch(`/api/batches/${batch.id}/deactivate`, {
        method: "POST",
      });
      if (res.ok) {
        const updatedBatch = await res.json();
        setBatch(updatedBatch);
        setPosts(
          posts.map((p) =>
            p.status === "scheduled" ? { ...p, status: "approved" } : p
          )
        );
      }
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleDeleteBatch() {
    setLoadingAction("delete");
    try {
      const res = await fetch(`/api/batches/${batch.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/batches");
      }
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/batches">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-900">
                {MONTHS[batch.month - 1]} {batch.year}
              </h2>
              <Badge
                className={BATCH_STATUS_STYLES[batch.status] || ""}
                variant="outline"
              >
                {batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {batch.total_posts} posts &middot; Created{" "}
              {new Date(batch.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {(batch.status === "draft") && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loadingAction !== null}
                  >
                    <CheckCheck className="h-4 w-4 mr-1.5" />
                    Approve Remaining
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve remaining posts?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will approve all posts that are still in draft or
                      edited status (both personal and company versions).
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleApproveRemaining}>
                      Approve Remaining
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loadingAction !== null}
                  >
                    <Building2 className="h-4 w-4 mr-1.5" />
                    Approve All Company
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve all company posts?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will approve the LinkedIn Company Page version for all posts.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleApproveCompany}>
                      Approve Company
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loadingAction !== null}
                  >
                    <User className="h-4 w-4 mr-1.5" />
                    Approve All Personal
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve all personal posts?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will approve the LinkedIn Personal Profile version for all posts.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleApprovePersonal}>
                      Approve Personal
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={loadingAction !== null}
                  >
                    {loadingAction === "approve-all" ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    )}
                    Approve All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve all 60 posts?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will set all posts to approved (both personal and company
                      versions) and mark the batch as ready for activation.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleApproveAll}>
                      Approve All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}

          {batch.status === "approved" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={loadingAction !== null}
                >
                  {loadingAction === "activate" ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-1.5" />
                  )}
                  Activate Batch
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Activate this batch?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will begin automatic posting to all platforms (LinkedIn,
                    X, Facebook, Google Business Profile) according to the
                    schedule. Personal profile posts will appear in Ready to Post.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleActivate}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Activate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {batch.status === "active" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingAction !== null}
                >
                  {loadingAction === "deactivate" ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Pause className="h-4 w-4 mr-1.5" />
                  )}
                  Pause Batch
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Pause this batch?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will stop automatic publishing. Scheduled posts will be
                    set back to approved. Already published posts won&apos;t be
                    affected. You can reactivate later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeactivate}>
                    Pause
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {batch.status === "draft" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  disabled={loadingAction !== null}
                >
                  {loadingAction === "delete" ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1.5" />
                  )}
                  Delete Batch
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this batch?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the batch and all {batch.total_posts} posts.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteBatch}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Approval Progress */}
      <Card>
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Approval Progress
            </span>
            <span className="text-sm font-medium text-gray-900">
              {approvedCount}/{posts.length} approved
            </span>
          </div>
          <Progress value={approvalPercent} className="h-2" />
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="did_you_know">Did You Know</SelectItem>
            <SelectItem value="savings_story">Savings Story</SelectItem>
            <SelectItem value="industry_tip">Industry Tip</SelectItem>
            <SelectItem value="myth_busting">Myth Busting</SelectItem>
            <SelectItem value="personal_take">Personal Take</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="edited">Edited</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={weekFilter} onValueChange={setWeekFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Week" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Weeks</SelectItem>
            <SelectItem value="1">Week 1</SelectItem>
            <SelectItem value="2">Week 2</SelectItem>
            <SelectItem value="3">Week 3</SelectItem>
            <SelectItem value="4">Week 4+</SelectItem>
          </SelectContent>
        </Select>

        <span className="flex items-center text-sm text-gray-500 ml-auto">
          {filteredPosts.length} post{filteredPosts.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Posts */}
      <div className="space-y-3">
        {filteredPosts.map((post) => (
          <Card key={post.id}>
            <CardHeader className="pb-2 px-5 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
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
                  <Badge
                    className={`text-xs ${CATEGORY_STYLES[post.content_category] || ""}`}
                  >
                    {CATEGORY_LABELS[post.content_category] || post.content_category}
                  </Badge>
                  {post.has_image && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <ImageIcon className="h-3 w-3" />
                      {post.image_template_type}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge className={`text-xs ${STATUS_STYLES[post.status] || ""}`}>
                    {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {/* LinkedIn Personal & Company side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-blue-600" />
                      <span className="text-xs font-medium text-gray-700">LinkedIn Personal</span>
                    </div>
                    <Button
                      variant={post.linkedin_personal_approved ? "default" : "outline"}
                      size="sm"
                      className={`text-xs h-6 px-2 ${
                        post.linkedin_personal_approved
                          ? "bg-green-600 hover:bg-green-700"
                          : ""
                      }`}
                      onClick={() => handleToggleApprove(post.id, "personal")}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-0.5" />
                      {post.linkedin_personal_approved ? "Approved" : "Approve"}
                    </Button>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-line line-clamp-4">
                    {post.linkedin_personal_content || "No personal content"}
                  </p>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-blue-600" />
                      <span className="text-xs font-medium text-gray-700">LinkedIn Company</span>
                    </div>
                    <Button
                      variant={post.linkedin_company_approved ? "default" : "outline"}
                      size="sm"
                      className={`text-xs h-6 px-2 ${
                        post.linkedin_company_approved
                          ? "bg-green-600 hover:bg-green-700"
                          : ""
                      }`}
                      onClick={() => handleToggleApprove(post.id, "company")}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-0.5" />
                      {post.linkedin_company_approved ? "Approved" : "Approve"}
                    </Button>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-line line-clamp-4">
                    {post.linkedin_content}
                  </p>
                </div>
              </div>

              {/* Image thumbnail preview */}
              {post.has_image && post.linkedin_image_url && (
                <div className="mb-3 flex items-center gap-3">
                  <img
                    src={post.linkedin_image_url}
                    alt="Post image"
                    className="h-16 w-auto rounded border"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => handleRegenerateImage(post.id)}
                    disabled={regeneratingImageId === post.id}
                  >
                    {regeneratingImageId === post.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Regenerate Image
                  </Button>
                </div>
              )}

              {/* Other platform tabs */}
              <Tabs defaultValue="x" className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-8">
                  <TabsTrigger value="x" className="text-xs">
                    X
                  </TabsTrigger>
                  <TabsTrigger value="facebook" className="text-xs">
                    Facebook
                  </TabsTrigger>
                  <TabsTrigger value="google" className="text-xs">
                    Google
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="x" className="mt-3">
                  <p className="text-sm text-gray-700">{post.x_content}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {post.x_content?.length || 0}/280 characters
                  </p>
                </TabsContent>
                <TabsContent value="facebook" className="mt-3">
                  <p className="text-sm text-gray-700 whitespace-pre-line">
                    {post.facebook_content}
                  </p>
                </TabsContent>
                <TabsContent value="google" className="mt-3">
                  <p className="text-sm text-gray-700 whitespace-pre-line">
                    {post.google_content}
                  </p>
                </TabsContent>
              </Tabs>

              {/* Platform publish status for published/failed posts */}
              {(post.status === "published" || post.status === "failed") && (
                <div className="flex items-center gap-3 mt-3 pt-3 border-t">
                  <span className="text-xs text-gray-500 mr-1">Platforms:</span>
                  {(["linkedin", "x", "facebook", "google"] as const).map(
                    (platform) => (
                      <div
                        key={platform}
                        className="flex items-center gap-1"
                        title={
                          post[`${platform}_published`]
                            ? `${platform} published`
                            : `${platform} failed`
                        }
                      >
                        {post[`${platform}_published`] ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-500" />
                        )}
                        <span className="text-xs text-gray-600 capitalize">
                          {platform === "google" ? "Google" : platform === "linkedin" ? "LI" : platform === "facebook" ? "FB" : "X"}
                        </span>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Error log for failed posts */}
              {post.status === "failed" && post.error_log && (
                <div className="flex items-start gap-2 mt-2 p-2 bg-red-50 rounded text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <pre className="whitespace-pre-wrap">{post.error_log}</pre>
                </div>
              )}

              {/* Post Actions */}
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setPreviewingPost(post)}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Preview
                </Button>
                {post.status !== "published" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setEditingPost(post)}
                    >
                      <Edit3 className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleRegenerate(post.id)}
                      disabled={regeneratingId === post.id}
                    >
                      {regeneratingId === post.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      )}
                      Regenerate
                    </Button>
                  </>
                )}

                {/* Retry button for failed posts */}
                {post.status === "failed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => handleRetry(post.id)}
                    disabled={retryingId === post.id}
                  >
                    {retryingId === post.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Retry Failed
                  </Button>
                )}

                <div className="ml-auto flex items-center gap-2">
                  {/* Publish Now button for approved/scheduled posts */}
                  {(post.status === "approved" || post.status === "scheduled") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                      onClick={() => handlePublishNow(post.id)}
                      disabled={publishingId === post.id}
                    >
                      {publishingId === post.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5 mr-1" />
                      )}
                      Publish Now
                    </Button>
                  )}

                  {/* Approve toggle for draft/edited posts */}
                  {(post.status === "draft" || post.status === "edited" || post.status === "approved") && (
                    <Button
                      variant={post.status === "approved" ? "default" : "outline"}
                      size="sm"
                      className={`text-xs ${
                        post.status === "approved"
                          ? "bg-green-600 hover:bg-green-700"
                          : ""
                      }`}
                      onClick={() => handleToggleApprove(post.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      {post.status === "approved" ? "Approved" : "Approve"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Batch Completed Message */}
      {batch.status === "completed" && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="flex items-center gap-3 py-4 px-5">
            <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">
                Batch Complete
              </p>
              <p className="text-xs text-green-600">
                All posts in this batch have been published.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Sheet */}
      {editingPost && (
        <PostEditSheet
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSave={handlePostSaved}
        />
      )}

      {/* Preview Modal */}
      {previewingPost && (
        <PostPreviewModal
          post={previewingPost}
          onClose={() => setPreviewingPost(null)}
        />
      )}
    </div>
  );
}
