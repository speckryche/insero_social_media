"use client";

import { useState, useMemo, useEffect, useRef } from "react";
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
  ExternalLink,
  Plus,
  Download,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PostEditSheet } from "@/components/post-edit-sheet";
import { PostPreviewModal } from "@/components/post-preview-modal";
import { LearnFromEditsDialog } from "@/components/learn-from-edits-dialog";
import { AddPostsDialog } from "@/components/add-posts-dialog";
import { PostImageDropZone } from "@/components/post-image-drop-zone";
import {
  BATCH_SCOPE_LABELS,
  BATCH_SCOPE_STYLES,
  batchScopeKey,
} from "@/lib/batch-scope";
import { batchPeriodLabel } from "@/lib/batch-period";
import { parseISODate, toISODate, weekdaysOf } from "@/lib/week";
import {
  DEFAULT_ENABLED_PLATFORMS,
  OPTIONAL_PLATFORMS,
  type Platform,
} from "@/lib/platforms";

const BATCH_STATUS_STYLES: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-blue-100 text-blue-800 border-blue-200",
  active: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-gray-100 text-gray-700 border-gray-200",
};

const CATEGORY_STYLES: Record<string, string> = {
  ai_speak: "bg-indigo-100 text-indigo-800",
  tech_speak: "bg-amber-100 text-amber-800",
  quote_speak: "bg-emerald-100 text-emerald-800",
  cost_speak: "bg-rose-100 text-rose-800",
  pots_speak: "bg-orange-100 text-orange-800",
  personal_take: "bg-violet-100 text-violet-800",
  // Legacy categories — see note above.
  humor_speak: "bg-orange-100 text-orange-800",
  bill_speak: "bg-sky-100 text-sky-800",
  contract_speak: "bg-rose-100 text-rose-800",
  did_you_know: "bg-sky-100 text-sky-800",
  savings_story: "bg-emerald-100 text-emerald-800",
  industry_tip: "bg-amber-100 text-amber-800",
  myth_busting: "bg-rose-100 text-rose-800",
};

const CATEGORY_LABELS: Record<string, string> = {
  ai_speak: "AI Speak",
  tech_speak: "Tech Speak",
  quote_speak: "Quote Speak",
  cost_speak: "Cost Speak",
  pots_speak: "POTS Speak",
  personal_take: "Personal Take",
  // Legacy categories — kept so posts from earlier batches still render a
  // label. Not offered in any picker.
  humor_speak: "Humor Speak",
  bill_speak: "Bill Speak",
  contract_speak: "Contract Speak",
  did_you_know: "Did You Know",
  savings_story: "Savings Story",
  industry_tip: "Industry Tip",
  myth_busting: "Myth Busting",
};

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

type Scope = "company" | "personal";

function scopeContent(post: Post, scope: Scope): string {
  const raw =
    scope === "company" ? post.linkedin_content : post.linkedin_personal_content;
  return String(raw || "").trim();
}

function isScopeApproved(post: Post, scope: Scope): boolean {
  return scope === "company"
    ? post.linkedin_company_approved === true
    : post.linkedin_personal_approved === true;
}

// Company and personal approve independently, so the post as a whole only
// reads as approved once every scope it actually has content for is approved.
// A post with only one populated scope is done as soon as that scope is —
// otherwise a company-only batch could never reach 100%.
function isFullyApproved(post: Post): boolean {
  const populated = (["company", "personal"] as Scope[]).filter(
    (scope) => scopeContent(post, scope).length > 0
  );
  if (populated.length === 0) return false;
  return populated.every((scope) => isScopeApproved(post, scope));
}

// ---- TXT export -----------------------------------------------------------

const EXPORT_DIVIDER = "=".repeat(60);
const SLOT_ORDER: Record<string, number> = { morning: 0, afternoon: 1 };

// Schedule order, so the file reads the way the week runs rather than the way
// the rows happen to come back.
function compareForExport(a: Post, b: Post): number {
  const byDate = String(a.scheduled_date || "").localeCompare(
    String(b.scheduled_date || "")
  );
  if (byDate !== 0) return byDate;
  const bySlot =
    (SLOT_ORDER[String(a.time_slot)] ?? 9) - (SLOT_ORDER[String(b.time_slot)] ?? 9);
  if (bySlot !== 0) return bySlot;
  return (a.post_number ?? 0) - (b.post_number ?? 0);
}

// ai_speak -> "AI SPEAK"
function exportCategory(category: string): string {
  return String(category || "uncategorized").replace(/_/g, " ").toUpperCase();
}

// "Monday, Aug 31 · Morning"
function exportDateLine(post: Post): string {
  const parts: string[] = [];
  if (post.scheduled_date) {
    parts.push(
      new Date(String(post.scheduled_date) + "T00:00:00").toLocaleDateString(
        "en-US",
        { weekday: "long", month: "short", day: "numeric" }
      )
    );
  }
  if (post.time_slot) {
    const slot = String(post.time_slot);
    parts.push(slot.charAt(0).toUpperCase() + slot.slice(1));
  }
  return parts.join(" · ");
}

// "Week of Mon Aug 31 – Fri Sep 4, 2026". Legacy monthly batches have no week,
// so they fall back to the label the rest of the app shows them under.
function exportPeriodLine(batch: Batch): string {
  if (!batch.week_start_date) return batchPeriodLabel(batch);
  const days = weekdaysOf(String(batch.week_start_date));
  const short = (d: Date) =>
    d
      .toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
      // en-US puts a comma after the weekday; the header reads better without.
      .replace(",", "");
  const monday = parseISODate(days[0]);
  const friday = parseISODate(days[4]);
  return `Week of ${short(monday)} – ${short(friday)}, ${friday.getFullYear()}`;
}

function buildExportText(batch: Batch, posts: Post[], scope: Scope): string {
  const lines: string[] = [
    `INSERO — ${scope === "company" ? "COMPANY" : "PERSONAL"} POSTS`,
    exportPeriodLine(batch),
    `${posts.length} approved post${posts.length === 1 ? "" : "s"}`,
    "",
  ];

  // Numbered by position in the file, not post_number — unapproved posts are
  // skipped, so the two would disagree.
  posts.forEach((post, i) => {
    lines.push(
      EXPORT_DIVIDER,
      `POST ${i + 1} — ${exportCategory(post.content_category)}`,
      exportDateLine(post),
      EXPORT_DIVIDER,
      "",
      scopeContent(post, scope),
      ""
    );
  });

  // CRLF throughout so the file opens cleanly in both TextEdit and Notepad.
  // Only the line ending changes — the posts keep their own blank lines.
  return lines.join("\n").replace(/\r?\n/g, "\r\n");
}

// Rendered twice — once in the toolbar, once under the post list.
function DownloadButtons({
  onDownload,
}: {
  onDownload: (scope: Scope) => void;
}) {
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => onDownload("personal")}>
        <Download className="h-4 w-4 mr-1.5 text-blue-600" />
        Download Personal
      </Button>
      <Button variant="outline" size="sm" onClick={() => onDownload("company")}>
        <Download className="h-4 w-4 mr-1.5 text-blue-600" />
        Download Company
      </Button>
    </>
  );
}

// One self-contained scope column: header + Preview, the text, the drop zone,
// its own action row, and its own approve control. Personal is blue
// throughout, company green, including the 2px accent on top of the panel.
const SCOPE_STYLES = {
  personal: {
    label: "LinkedIn Personal",
    accent: "border-t-2 border-t-blue-500",
    text: "text-blue-600",
    approved: "bg-blue-600 hover:bg-blue-700",
  },
  company: {
    label: "LinkedIn Company",
    accent: "border-t-2 border-t-green-600",
    text: "text-green-600",
    approved: "bg-green-600 hover:bg-green-700",
  },
} as const;

function ScopePanel({
  post,
  scope,
  collapsed,
  regenerating,
  onPreview,
  onEdit,
  onRegenerate,
  onToggleApprove,
  onImageUpdated,
  onNotice,
}: {
  post: Post;
  scope: Scope;
  collapsed: boolean;
  regenerating: boolean;
  onPreview: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
  onToggleApprove: () => void;
  onImageUpdated: (post: Post) => void;
  onNotice: (text: string) => void;
}) {
  const style = SCOPE_STYLES[scope];
  const content = scopeContent(post, scope);
  // An empty personal scope has nothing to act on, so every control in the
  // panel goes inert rather than disappearing — the two columns stay aligned.
  const empty = content.length === 0;
  const approved = isScopeApproved(post, scope);
  const Icon = scope === "personal" ? User : Building2;

  return (
    <div className={`rounded-lg border p-3 ${style.accent}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${style.text}`} />
          <span className={`text-xs font-medium ${style.text}`}>
            {style.label}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onPreview}
          disabled={empty}
        >
          <Eye className="mr-1 h-3 w-3" />
          Preview
        </Button>
      </div>

      <p
        className={`whitespace-pre-wrap text-sm text-gray-700 ${
          collapsed ? "line-clamp-4" : ""
        }`}
      >
        {content || "No personal content"}
      </p>

      <PostImageDropZone
        post={post}
        scope={scope}
        imageUrl={
          (scope === "company"
            ? post.linkedin_image_url
            : post.linkedin_personal_image_url) || null
        }
        enabled={!empty}
        onUpdated={onImageUpdated}
        onNotice={onNotice}
      />

      {/* Action row — each button acts on this scope only. */}
      <div className="mt-3 flex flex-wrap items-center gap-1">
        <CopyButton text={content} label={style.label} />
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onEdit}
          disabled={empty || post.status === "published"}
        >
          <Edit3 className="mr-1 h-3 w-3" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onRegenerate}
          disabled={empty || regenerating || post.status === "published"}
        >
          {regenerating ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          Regenerate
        </Button>
      </div>

      <div className="mt-3 border-t pt-3">
        {empty ? (
          <p className="text-center text-xs text-gray-400">No personal post</p>
        ) : (
          <Button
            variant={approved ? "default" : "outline"}
            size="sm"
            className={`w-full text-xs ${approved ? style.approved : ""}`}
            onClick={onToggleApprove}
          >
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            {approved
              ? scope === "company"
                ? "Company approved"
                : "Personal approved"
              : scope === "company"
              ? "Approve company"
              : "Approve personal"}
          </Button>
        )}
      </div>
    </div>
  );
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
  const [editing, setEditing] = useState<{ post: Post; scope: Scope } | null>(
    null
  );
  // Keyed "<postId>:<scope>" — one scope regenerating must not spin the other.
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<{
    post: Post;
    scope: Scope;
  } | null>(null);
  // Cards show full post text by default. Ids land here only when the user
  // collapses that card back down to a four-line preview.
  const [collapsedPostIds, setCollapsedPostIds] = useState<Set<string>>(new Set());
  const [learningOpen, setLearningOpen] = useState(false);
  const [savedSamples, setSavedSamples] = useState<number | null>(null);
  const [addingPosts, setAddingPosts] = useState(false);

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

  // A post counts as "approved" once every scope it has content for is
  // approved. Scheduled and published are past the approval gate already and
  // always count.
  const approvedCount = posts.filter(
    (p) =>
      p.status === "scheduled" ||
      p.status === "published" ||
      isFullyApproved(p)
  ).length;
  const approvalPercent = Math.round((approvedCount / posts.length) * 100);

  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const noticeSeq = useRef(0);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

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

  // Minimal stand-in for a toast — the app has none, and the download buttons
  // render in two places, so an inline confirmation next to the click doesn't
  // work here the way it does on CopyButton. Keyed by a counter so clicking
  // twice with the same message re-shows it.
  function showNotice(text: string) {
    noticeSeq.current += 1;
    setNotice({ id: noticeSeq.current, text });
  }

  function handleDownload(scope: Scope) {
    const approved = posts
      .filter((p) => isScopeApproved(p, scope) && scopeContent(p, scope).length > 0)
      .sort(compareForExport);

    if (approved.length === 0) {
      showNotice(
        `No ${scope} posts are approved yet — approve some before downloading.`
      );
      return;
    }

    const stamp = batch.week_start_date
      ? String(batch.week_start_date)
      : toISODate(new Date());
    const blob = new Blob([buildExportText(batch, approved, scope)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `insero-${scope}-${stamp}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    showNotice(
      `Downloaded ${approved.length} approved ${scope} post${
        approved.length === 1 ? "" : "s"
      }.`
    );
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

  // The route already branches on `type` — personal, company, or all. The UI
  // only ever asks for one scope now.
  async function handleRegenerate(postId: string, scope: Scope) {
    setRegeneratingKey(`${postId}:${scope}`);
    try {
      const res = await fetch(`/api/posts/${postId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: scope }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPosts(posts.map((p) => (p.id === postId ? updated : p)));
      } else {
        const data = await res.json().catch(() => ({}));
        showNotice(data.error || "Regenerate failed.");
      }
    } finally {
      setRegeneratingKey(null);
    }
  }

  // The drop zones own image state now; they hand back the updated row.
  function handlePostImageUpdated(updated: Post) {
    setPosts(posts.map((p) => (p.id === updated.id ? updated : p)));
  }

  function handlePostSaved(updatedPost: Post) {
    setPosts(posts.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
    setEditing(null);
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
      <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/batches">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="whitespace-nowrap text-xl font-semibold text-gray-900">
                {batchPeriodLabel(batch)}
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

        {/* Action Buttons — wraps to as many lines as it needs. No shrink-0
            here: that pinned the row at its natural width, which squeezed the
            title to one word per line and pushed the last buttons off-screen. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
          {/* Reads the batch's edits and proposes Settings additions. Never
              applies anything on its own — every proposal is accepted or
              dismissed by hand in the dialog. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddingPosts(true)}
            disabled={loadingAction !== null}
          >
            <Plus className="h-4 w-4 mr-1.5 text-blue-600" />
            Add posts
          </Button>

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

          <DownloadButtons onDownload={handleDownload} />

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
            <SelectItem value="ai_speak">AI Speak</SelectItem>
            <SelectItem value="tech_speak">Tech Speak</SelectItem>
            <SelectItem value="quote_speak">Quote Speak</SelectItem>
            <SelectItem value="cost_speak">Cost Speak</SelectItem>
            <SelectItem value="pots_speak">POTS Speak</SelectItem>
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
                  {post.linkedin_image_url || post.linkedin_personal_image_url ? (
                    <span title="Image attached" className="inline-flex items-center">
                      <Camera className="h-4 w-4 text-green-600" />
                    </span>
                  ) : (
                    <span title="No image for this post" className="inline-flex items-center">
                      <CameraOff className="h-4 w-4 text-gray-300" />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {post.headline_source_url && (
                    <a
                      href={post.headline_source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={post.headline_text || "Source"}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Source
                    </a>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {/* LinkedIn Personal & Company side by side */}
              <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <ScopePanel
                  post={post}
                  scope="personal"
                  collapsed={collapsedPostIds.has(post.id)}
                  regenerating={regeneratingKey === `${post.id}:personal`}
                  onPreview={() => setPreviewing({ post, scope: "personal" })}
                  onEdit={() => setEditing({ post, scope: "personal" })}
                  onRegenerate={() => handleRegenerate(post.id, "personal")}
                  onToggleApprove={() => handleToggleApprove(post.id, "personal")}
                  onImageUpdated={handlePostImageUpdated}
                  onNotice={showNotice}
                />
                <ScopePanel
                  post={post}
                  scope="company"
                  collapsed={collapsedPostIds.has(post.id)}
                  regenerating={regeneratingKey === `${post.id}:company`}
                  onPreview={() => setPreviewing({ post, scope: "company" })}
                  onEdit={() => setEditing({ post, scope: "company" })}
                  onRegenerate={() => handleRegenerate(post.id, "company")}
                  onToggleApprove={() => handleToggleApprove(post.id, "company")}
                  onImageUpdated={handlePostImageUpdated}
                  onNotice={showNotice}
                />
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

                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Same downloads as the toolbar, for the end of a long list. */}
      {posts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <DownloadButtons onDownload={handleDownload} />
        </div>
      )}

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
      {editing && (
        <PostEditSheet
          post={editing.post}
          scope={editing.scope}
          onClose={() => setEditing(null)}
          onSave={handlePostSaved}
          enabledPlatforms={enabledPlatforms}
        />
      )}

      {/* Preview Modal */}
      {previewing && (
        <PostPreviewModal
          post={previewing.post}
          scope={previewing.scope}
          onClose={() => setPreviewing(null)}
          enabledPlatforms={enabledPlatforms}
        />
      )}

      {learningOpen && (
        <LearnFromEditsDialog
          batchId={batch.id}
          onClose={() => setLearningOpen(false)}
        />
      )}

      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg"
        >
          {notice.text}
        </div>
      )}

      {addingPosts && (
        <AddPostsDialog
          batchId={batch.id}
          scope={batch.scope}
          // Null on the legacy monthly batches, which schedule across a whole
          // month and have no per-week slot budget to show.
          weekStart={batch.week_start_date ?? null}
          onClose={() => setAddingPosts(false)}
          // Pull the batch and its posts fresh so the new rows appear in the
          // list, in schedule order, without a manual reload.
          onAdded={() => router.refresh()}
        />
      )}
    </div>
  );
}
