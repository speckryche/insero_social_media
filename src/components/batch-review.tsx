"use client";

import { useState, useMemo, useEffect } from "react";
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
  Camera,
  CameraOff,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  BookmarkPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { PostEditSheet } from "@/components/post-edit-sheet";
import { PostPreviewModal } from "@/components/post-preview-modal";
import { LearnFromEditsDialog } from "@/components/learn-from-edits-dialog";
import {
  BATCH_SCOPE_LABELS,
  BATCH_SCOPE_STYLES,
  batchScopeKey,
} from "@/lib/batch-scope";
import {
  DEFAULT_ENABLED_PLATFORMS,
  OPTIONAL_PLATFORMS,
  type Platform,
} from "@/lib/platforms";

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
  bill_speak: "bg-sky-100 text-sky-800",
  contract_speak: "bg-rose-100 text-rose-800",
  quote_speak: "bg-emerald-100 text-emerald-800",
  tech_speak: "bg-amber-100 text-amber-800",
  personal_take: "bg-violet-100 text-violet-800",
  // Legacy categories — see note above.
  did_you_know: "bg-sky-100 text-sky-800",
  savings_story: "bg-emerald-100 text-emerald-800",
  industry_tip: "bg-amber-100 text-amber-800",
  myth_busting: "bg-rose-100 text-rose-800",
};

const CATEGORY_LABELS: Record<string, string> = {
  bill_speak: "Bill Speak",
  contract_speak: "Contract Speak",
  quote_speak: "Quote Speak",
  tech_speak: "Tech Speak",
  personal_take: "Personal Take",
  // Legacy categories — kept so posts from pre-Telecom-speak batches still
  // render a label. Not offered in any picker.
  did_you_know: "Did You Know",
  savings_story: "Savings Story",
  industry_tip: "Industry Tip",
  myth_busting: "Myth Busting",
};

// Default image template to assign when a user toggles "Include image" on a
// post that has no image_template_type set (e.g., a text-only batch).
const DEFAULT_TEMPLATE_BY_CATEGORY: Record<string, string> = {
  bill_speak: "photo_stat",
  contract_speak: "checklist",
  quote_speak: "photo_landscape",
  tech_speak: "photo_tip",
  personal_take: "photo_landscape",
  // Legacy categories — see note above.
  did_you_know: "photo_stat",
  savings_story: "photo_landscape",
  industry_tip: "photo_tip",
  myth_busting: "myth_buster",
};

// All 12 templates the user can pick from the per-post template selector.
// 8 canvas templates followed by 4 photo templates.
const TEMPLATE_OPTIONS = [
  "stat_card",
  "quote_card",
  "tip_graphic",
  "comparison",
  "savings_highlight",
  "myth_buster",
  "did_you_know",
  "checklist",
  "photo_landscape",
  "photo_tip",
  "photo_stat",
  "photo_quote",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Post = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Batch = any;

interface BatchReviewProps {
  initialBatch: Batch;
  initialPosts: Post[];
  enabledPlatforms?: Platform[];
}

function getWeekNumber(dateStr: string): number {
  const date = new Date(dateStr + "T00:00:00");
  const dayOfMonth = date.getDate();
  if (dayOfMonth <= 7) return 1;
  if (dayOfMonth <= 14) return 2;
  if (dayOfMonth <= 21) return 3;
  return 4;
}

// Copies one variant's plain text and confirms inline on the button itself.
// There's no toast system in the app, and a card carries up to five of these,
// so the confirmation stays where the click happened.
function CopyButton({ text, label }: { text: string | null | undefined; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    const value = text || "";
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // clipboard API needs a secure context; fall back to a temporary textarea
      try {
        const el = document.createElement("textarea");
        el.value = value;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setCopied(true);
      } catch (err) {
        console.error("Copy failed:", err);
      }
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-xs h-6 px-2 text-gray-500 hover:text-gray-900"
      onClick={handleCopy}
      disabled={!text}
      aria-label={`Copy ${label} text`}
      title={`Copy ${label} text`}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 mr-0.5 text-green-600" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3 mr-0.5" />
          Copy
        </>
      )}
    </Button>
  );
}

export function BatchReview({
  initialBatch,
  initialPosts,
  enabledPlatforms = DEFAULT_ENABLED_PLATFORMS,
}: BatchReviewProps) {
  // The optional platforms that are switched on. When none are, the whole
  // tab row goes away and a card is just the two LinkedIn variants.
  const extraPlatforms = OPTIONAL_PLATFORMS.filter((p) =>
    enabledPlatforms.includes(p)
  );
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
  const [togglingImageId, setTogglingImageId] = useState<string | null>(null);
  const [autoAddingImageId, setAutoAddingImageId] = useState<string | null>(null);
  // Cards show full post text by default. Ids land here only when the user
  // collapses that card back down to a four-line preview.
  const [collapsedPostIds, setCollapsedPostIds] = useState<Set<string>>(new Set());
  const [learningOpen, setLearningOpen] = useState(false);
  const [savedSamples, setSavedSamples] = useState<number | null>(null);

  function toggleCollapsed(postId: string) {
    setCollapsedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }

  // A post counts as "approved" if its overall status is approved/scheduled/
  // published OR if either per-platform approval flag is true. The flag-true
  // check covers rows from older clicks of the LinkedIn Personal/Company
  // approve buttons (which used to only flip the flag and leave status
  // alone). The Activate route now heals these into status="approved".
  const approvedCount = posts.filter(
    (p) =>
      p.status === "approved" ||
      p.status === "scheduled" ||
      p.status === "published" ||
      p.linkedin_personal_approved === true ||
      p.linkedin_company_approved === true
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
        // Mirror the server-side status sync: draft/edited rows get promoted
        // to approved alongside the flag flip.
        setPosts(
          posts.map((p) => ({
            ...p,
            linkedin_company_approved: true,
            status: p.status === "draft" || p.status === "edited" ? "approved" : p.status,
          }))
        );
      }
    } finally {
      setLoadingAction(null);
    }
  }

  // Saves this batch's edited personal posts straight to Style samples, with
  // no proposals involved. Same endpoint the Learn dialog uses, minus a runId.
  async function handleSaveStyleSamples() {
    setLoadingAction("style-samples");
    setSavedSamples(null);
    try {
      const res = await fetch(`/api/batches/${batch.id}/learn`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: [], saveStyleSamples: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setSavedSamples(data.styleSamplesAdded ?? 0);
        setTimeout(() => setSavedSamples(null), 4000);
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
        setPosts(
          posts.map((p) => ({
            ...p,
            linkedin_personal_approved: true,
            status: p.status === "draft" || p.status === "edited" ? "approved" : p.status,
          }))
        );
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
        // Mirror the server-side activate behavior so local state matches:
        //   1. Heal: any draft/edited row with at least one approval flag
        //      gets bumped to "approved" (handles legacy rows where the
        //      per-platform approve buttons used to flip only the flag).
        //   2. Promote: any "approved" row becomes "scheduled".
        setPosts(
          posts.map((p) => {
            const anyFlag =
              p.linkedin_personal_approved === true ||
              p.linkedin_company_approved === true;
            const isDraftish = p.status === "draft" || p.status === "edited";
            const healed = isDraftish && anyFlag ? "approved" : p.status;
            const promoted = healed === "approved" ? "scheduled" : healed;
            return { ...p, status: promoted };
          })
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

  async function handleChangeTemplate(post: Post, newTemplate: string) {
    if (newTemplate === post.image_template_type) return;
    setRegeneratingImageId(post.id);
    try {
      const patchRes = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_template_type: newTemplate,
          status: post.status,
        }),
      });
      if (!patchRes.ok) return;

      const renderRes = await fetch(`/api/posts/${post.id}/regenerate-image`, {
        method: "POST",
      });
      if (renderRes.ok) {
        const updated = await renderRes.json();
        setPosts(posts.map((p) => (p.id === post.id ? updated : p)));
      }
    } finally {
      setRegeneratingImageId(null);
    }
  }

  async function handleToggleImage(post: Post) {
    const turningOn = !post.has_image;

    // Turning OFF — clear has_image and the per-platform URLs, preserve
    // image_template_type / image_headline so toggling back ON still works.
    if (!turningOn) {
      setTogglingImageId(post.id);
      try {
        const patchRes = await fetch(`/api/posts/${post.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            has_image: false,
            linkedin_image_url: null,
            x_image_url: null,
            facebook_image_url: null,
            google_image_url: null,
            linkedin_personal_image_url: null,
            status: post.status,
          }),
        });
        if (patchRes.ok) {
          const updated = await patchRes.json();
          setPosts(posts.map((p) => (p.id === post.id ? updated : p)));
        }
      } finally {
        setTogglingImageId(null);
      }
      return;
    }

    // Turning ON, post already has image_template_type + headline/body — just
    // flip the flag and render images.
    if (post.image_template_type) {
      setTogglingImageId(post.id);
      try {
        const patchRes = await fetch(`/api/posts/${post.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ has_image: true, status: post.status }),
        });
        if (!patchRes.ok) return;

        const genRes = await fetch(`/api/posts/${post.id}/regenerate-image`, {
          method: "POST",
        });
        if (!genRes.ok) {
          await fetch(`/api/posts/${post.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ has_image: false, status: post.status }),
          });
          return;
        }
        const updated = await genRes.json();
        setPosts(posts.map((p) => (p.id === post.id ? updated : p)));
      } finally {
        setTogglingImageId(null);
      }
      return;
    }

    // Auto-add flow: turning ON a text-only post with no template. Pick a
    // default template by category, persist it, regenerate the post so the
    // LLM produces image_headline/image_body (the regenerate route includes
    // image fields when has_image is true), then render the image.
    setAutoAddingImageId(post.id);
    try {
      const defaultTemplate =
        DEFAULT_TEMPLATE_BY_CATEGORY[post.content_category as string] ?? "stat_card";

      const patchRes = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          has_image: true,
          image_template_type: defaultTemplate,
          status: post.status,
        }),
      });
      if (!patchRes.ok) return;

      const regenRes = await fetch(`/api/posts/${post.id}/regenerate`, {
        method: "POST",
      });
      if (!regenRes.ok) {
        // Roll back the flag if regeneration fails so the toggle reflects reality
        await fetch(`/api/posts/${post.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ has_image: false, status: post.status }),
        });
        return;
      }

      const renderRes = await fetch(`/api/posts/${post.id}/regenerate-image`, {
        method: "POST",
      });
      if (renderRes.ok) {
        const updated = await renderRes.json();
        setPosts(posts.map((p) => (p.id === post.id ? updated : p)));
      }
    } finally {
      setAutoAddingImageId(null);
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
              <Badge
                className={BATCH_SCOPE_STYLES[batchScopeKey(batch.scope)]}
                variant="outline"
              >
                {BATCH_SCOPE_LABELS[batchScopeKey(batch.scope)]}
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
          {/* Reads the batch's edits and proposes Settings additions. Never
              applies anything on its own — every proposal is accepted or
              dismissed by hand in the dialog. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLearningOpen(true)}
            disabled={loadingAction !== null}
          >
            <Sparkles className="h-4 w-4 mr-1.5 text-blue-600" />
            Learn from my edits
          </Button>

          {/* Same style-sample save as the dialog offers, without needing to
              run an analysis first. */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveStyleSamples}
            disabled={loadingAction !== null}
          >
            {loadingAction === "style-samples" ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : savedSamples !== null ? (
              <Check className="h-4 w-4 mr-1.5 text-green-600" />
            ) : (
              <BookmarkPlus className="h-4 w-4 mr-1.5 text-blue-600" />
            )}
            {savedSamples !== null
              ? savedSamples === 0
                ? "Nothing new to save"
                : `Saved ${savedSamples}`
              : "Save edits as style samples"}
          </Button>

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

          {/* Activate Batch — visible while the batch is still actionable
              (draft or approved) and at least one post has been approved.
              Activation promotes approved posts to "scheduled" and lets the
              cron picker pick them up. */}
          {(batch.status === "draft" || batch.status === "approved") &&
            approvedCount > 0 && (
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
                    schedule. Only posts already marked Approved will be
                    scheduled — drafts stay out of the queue. Personal profile
                    posts will appear in Ready to Post.
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
            <SelectItem value="bill_speak">Bill Speak</SelectItem>
            <SelectItem value="contract_speak">Contract Speak</SelectItem>
            <SelectItem value="quote_speak">Quote Speak</SelectItem>
            <SelectItem value="tech_speak">Tech Speak</SelectItem>
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
                  {/* Image status indicator — quick visual scan */}
                  {togglingImageId === post.id || autoAddingImageId === post.id ? (
                    <span title="Image generation in progress" className="inline-flex items-center">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    </span>
                  ) : post.has_image && post.linkedin_image_url ? (
                    <span title="Image generated and ready" className="inline-flex items-center">
                      <Camera className="h-4 w-4 text-green-600" />
                    </span>
                  ) : post.has_image ? (
                    <span title="Image pending" className="inline-flex items-center">
                      <Camera className="h-4 w-4 text-gray-400" />
                    </span>
                  ) : (
                    <span title="No image for this post" className="inline-flex items-center">
                      <CameraOff className="h-4 w-4 text-gray-300" />
                    </span>
                  )}
                  {post.has_image && post.image_template_type && (
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
                    <div className="flex items-center gap-1">
                      <CopyButton
                        text={post.linkedin_personal_content}
                        label="LinkedIn Personal"
                      />
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
                  </div>
                  <p
                    className={`text-sm text-gray-700 whitespace-pre-wrap ${
                      collapsedPostIds.has(post.id) ? "line-clamp-4" : ""
                    }`}
                  >
                    {post.linkedin_personal_content || "No personal content"}
                  </p>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-blue-600" />
                      <span className="text-xs font-medium text-gray-700">LinkedIn Company</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CopyButton
                        text={post.linkedin_content}
                        label="LinkedIn Company"
                      />
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
                  </div>
                  <p
                    className={`text-sm text-gray-700 whitespace-pre-wrap ${
                      collapsedPostIds.has(post.id) ? "line-clamp-4" : ""
                    }`}
                  >
                    {post.linkedin_content}
                  </p>
                </div>
              </div>

              {/* Image control row — toggle, status, thumbnail, regenerate */}
              <div className="mb-3 flex items-center gap-3 flex-wrap">
                <Switch
                  checked={post.has_image}
                  onCheckedChange={() => handleToggleImage(post)}
                  disabled={togglingImageId === post.id || autoAddingImageId === post.id}
                  aria-label="Include image for this post"
                />
                <span className="text-xs font-medium text-gray-700">Include image</span>
                {autoAddingImageId === post.id ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-blue-600">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Adding image…
                  </span>
                ) : togglingImageId === post.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                ) : null}
                {post.has_image && post.linkedin_image_url && (
                  <>
                    <img
                      src={post.linkedin_image_url}
                      alt="Post image"
                      className="h-16 w-auto rounded border ml-auto"
                    />
                    <Select
                      value={post.image_template_type || undefined}
                      onValueChange={(v) => handleChangeTemplate(post, v)}
                      disabled={regeneratingImageId === post.id}
                    >
                      <SelectTrigger className="h-8 w-[170px] text-xs">
                        <SelectValue placeholder="Template" />
                      </SelectTrigger>
                      <SelectContent>
                        {TEMPLATE_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t} className="text-xs">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  </>
                )}
              </div>

              {/* Other platform tabs */}
              {extraPlatforms.length > 0 && (
              <Tabs defaultValue={extraPlatforms[0]} className="w-full">
                <TabsList
                  className="grid w-full h-8"
                  style={{
                    gridTemplateColumns: `repeat(${extraPlatforms.length}, minmax(0, 1fr))`,
                  }}
                >
                  {extraPlatforms.includes("x") && (
                    <TabsTrigger value="x" className="text-xs">
                      X
                    </TabsTrigger>
                  )}
                  {extraPlatforms.includes("facebook") && (
                    <TabsTrigger value="facebook" className="text-xs">
                      Facebook
                    </TabsTrigger>
                  )}
                  {extraPlatforms.includes("google") && (
                    <TabsTrigger value="google" className="text-xs">
                      Google
                    </TabsTrigger>
                  )}
                </TabsList>
                {extraPlatforms.includes("x") && (
                <TabsContent value="x" className="mt-3">
                  <div className="flex justify-end -mt-1 mb-1">
                    <CopyButton text={post.x_content} label="X" />
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {post.x_content}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {post.x_content?.length || 0}/280 characters
                  </p>
                </TabsContent>
                )}
                {extraPlatforms.includes("facebook") && (
                <TabsContent value="facebook" className="mt-3">
                  <div className="flex justify-end -mt-1 mb-1">
                    <CopyButton text={post.facebook_content} label="Facebook" />
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {post.facebook_content}
                  </p>
                </TabsContent>
                )}
                {extraPlatforms.includes("google") && (
                <TabsContent value="google" className="mt-3">
                  <div className="flex justify-end -mt-1 mb-1">
                    <CopyButton text={post.google_content} label="Google" />
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {post.google_content}
                  </p>
                </TabsContent>
                )}
              </Tabs>
              )}

              {/* Platform publish status for published/failed posts */}
              {(post.status === "published" || post.status === "failed") && (
                <div className="flex items-center gap-3 mt-3 pt-3 border-t">
                  <span className="text-xs text-gray-500 mr-1">Platforms:</span>
                  {enabledPlatforms.map(
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
                  onClick={() => toggleCollapsed(post.id)}
                  aria-expanded={!collapsedPostIds.has(post.id)}
                >
                  {collapsedPostIds.has(post.id) ? (
                    <>
                      <ChevronDown className="h-3.5 w-3.5 mr-1" />
                      Expand
                    </>
                  ) : (
                    <>
                      <ChevronUp className="h-3.5 w-3.5 mr-1" />
                      Collapse
                    </>
                  )}
                </Button>
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
                  {/* Publish Now — visible for approved/scheduled posts, plus
                      a safety-net case for posts that have an approval flag
                      set while the batch is active (covers any local-state
                      drift). Hidden once a post is published. */}
                  {post.status !== "published" &&
                    post.status !== "failed" &&
                    (post.status === "approved" ||
                      post.status === "scheduled" ||
                      (batch.status === "active" &&
                        (post.linkedin_personal_approved === true ||
                          post.linkedin_company_approved === true))) && (
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
          enabledPlatforms={enabledPlatforms}
        />
      )}

      {/* Preview Modal */}
      {previewingPost && (
        <PostPreviewModal
          post={previewingPost}
          onClose={() => setPreviewingPost(null)}
          enabledPlatforms={enabledPlatforms}
        />
      )}

      {learningOpen && (
        <LearnFromEditsDialog
          batchId={batch.id}
          onClose={() => setLearningOpen(false)}
        />
      )}
    </div>
  );
}
