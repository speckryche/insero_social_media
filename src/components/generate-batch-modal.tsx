"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Plus,
  Sparkles,
  Newspaper,
  ExternalLink,
  NotebookPen,
} from "lucide-react";
import {
  HEADLINE_FEEDS,
  FEED_LABELS,
  SCOPE_BY_FEED,
  scanScopesForBatch,
  type FeedScope,
  type HeadlineItem,
} from "@/lib/headlines";
import { NOTES_PER_SCOPE, type NoteScope } from "@/lib/notes";
import { POST_COUNT_PRESETS, DEFAULT_POST_COUNT } from "@/lib/post-count";


// What each size means in practice, since "5 posts" alone doesn't say how
// they land across the week.
const POST_COUNT_HINTS: Record<number, string> = {
  5: "1 per weekday",
  10: "2 per weekday",
};

const PROGRESS_MESSAGES = [
  "Creating batch...",
  'Generating "AI Speak" posts...',
  'Generating "Tech Speak" posts...',
  'Generating "Quote Speak" posts...',
  'Generating "Cost Speak" posts...',
  'Generating "POTS Speak" posts...',
  'Generating "Personal Take" posts...',
  "Assigning schedules and images...",
  "Almost done...",
];

type BatchScope = "both" | "company" | "personal";

const SCOPE_OPTIONS: Array<{ value: BatchScope; label: string; hint: string }> = [
  { value: "both", label: "Both", hint: "Company page + Speck's profile" },
  { value: "company", label: "Company only", hint: "The five company categories" },
  { value: "personal", label: "Personal only", hint: "Personal Take posts only" },
];

// Test mode ignores the size picker: 2 per included category.
const SCOPE_TEST_COUNTS: Record<BatchScope, number> = {
  both: 12,
  company: 10,
  personal: 2,
};

export function GenerateBatchModal() {
  const router = useRouter();

  // Batches are generated on a weekend for the week ahead, so next Monday is
  // the common case and needs no clicks.
  const [open, setOpen] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [scope, setScope] = useState<BatchScope>("both");
  const [postCount, setPostCount] = useState(String(DEFAULT_POST_COUNT));
  const [loading, setLoading] = useState(false);
  // Unconsumed notes waiting per scope. Read-only — notes are not opt-in the
  // way headlines are, so this only says what generation will draw on.
  const [noteCounts, setNoteCounts] = useState<Record<
    NoteScope,
    number
  > | null>(null);
  const [progressIndex, setProgressIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  // One scan id per feed scope — a "both" batch has two.
  const [scanIds, setScanIds] = useState<Partial<Record<FeedScope, string>>>({});
  const [headlines, setHeadlines] = useState<HeadlineItem[]>([]);
  // Nothing is used unless it is ticked — headlines are opt-in per item.
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  // Counted when the dialog opens, so the line reflects whatever was jotted
  // down since last time without needing a refresh.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/notes");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data)) return;

        const counts: Record<NoteScope, number> = { company: 0, personal: 0 };
        for (const note of data) {
          if (note.consumed) continue;
          if (note.scope === "company" || note.scope === "personal") {
            counts[note.scope as NoteScope] += 1;
          }
        }
        setNoteCounts(counts);
      } catch {
        // A missing count is not worth an error in this dialog — the line
        // simply does not render and generation still picks notes up.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleScanHeadlines() {
    setScanning(true);
    setScanError(null);
    try {
      // Feeds belong to one audience each, so a "both" batch runs a scan per
      // scope and shows the union. They run in parallel — one slow scope must
      // not hold up the other.
      const scopes = scanScopesForBatch(scope);
      const results = await Promise.all(
        scopes.map(async (feedScope) => {
          const res = await fetch("/api/headlines/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope: feedScope }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Scan failed");
          return data as { scanId: string; scope: FeedScope; items: HeadlineItem[] };
        })
      );

      const nextScanIds: Partial<Record<FeedScope, string>> = {};
      for (const result of results) {
        if (result.scanId) nextScanIds[result.scope] = result.scanId;
      }

      setScanIds(nextScanIds);
      setHeadlines(results.flatMap((r) => r.items || []));
      setPickedIds([]);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setScanning(false);
    }
  }

  function togglePicked(id: string) {
    setPickedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setProgressIndex(0);

    // Cycle through progress messages while waiting
    const interval = setInterval(() => {
      setProgressIndex((prev) =>
        prev < PROGRESS_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 60000);

    try {
      // Persist the picks on the scan row each item came from. A feed belongs
      // to exactly one scope, so every picked id routes to exactly one scan.
      if (pickedIds.length > 0) {
        const idsByScope: Partial<Record<FeedScope, string[]>> = {};
        for (const item of headlines) {
          if (!pickedIds.includes(item.id)) continue;
          const feedScope = SCOPE_BY_FEED[item.feed];
          (idsByScope[feedScope] ||= []).push(item.id);
        }

        await Promise.all(
          Object.entries(idsByScope).map(([feedScope, ids]) => {
            const id = scanIds[feedScope as FeedScope];
            if (!id) return Promise.resolve();
            return fetch("/api/headlines/scan", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ scanId: id, headlineIds: ids }),
            }).catch(() => {});
          })
        );
      }

      const res = await fetch("/api/generate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testMode,
          scope,
          postCount: parseInt(postCount),
          // No scanId: a "both" batch has one scan per scope, so generation
          // reads the newest scan for each scope the batch needs — which is
          // the set this dialog just produced.
          headlineIds: pickedIds,
        }),
      });

      clearInterval(interval);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }

      const data = await res.json();
      setOpen(false);
      router.push(`/batches/${data.batchId}`);
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  const chosenSize = parseInt(postCount) || DEFAULT_POST_COUNT;
  // The size is the exact post count for whichever scope is chosen — the
  // scope only decides which categories those posts are split across.
  const effectiveCount = testMode ? SCOPE_TEST_COUNTS[scope] : chosenSize;
  const scopeLabel = SCOPE_OPTIONS.find((o) => o.value === scope)!.label;

  // What the selected scope will actually be offered — capped the same way
  // the route caps it, so the number here is the number the model sees.
  // Personal first, matching the count line on the Notes page.
  const noteScopes = (["personal", "company"] as NoteScope[]).filter((s) =>
    scanScopesForBatch(scope).includes(s)
  );
  const offeredNotes = noteCounts
    ? noteScopes.map((s) => ({
        scope: s,
        count: Math.min(noteCounts[s], NOTES_PER_SCOPE[s]),
      }))
    : [];
  const offeredNoteTotal = offeredNotes.reduce((sum, n) => sum + n.count, 0);


  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading || error) { setOpen(v); setLoading(false); setError(null); } }}>
      <DialogTrigger asChild>
        <Button
          size="lg"
          className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
        >
          <Plus className="h-5 w-5" />
          Generate New Batch
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {loading && !error ? (
          <div className="flex flex-col items-center py-10 gap-4">
            <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
            <div className="text-center">
              <p className="font-medium text-gray-900">
                {testMode
                  ? `Generating ${effectiveCount} test posts...`
                  : `Generating ${effectiveCount} posts...`}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {PROGRESS_MESSAGES[progressIndex]}
              </p>
              <p className="text-xs text-gray-400 mt-3">
                {testMode ? "This should take about 2 minutes" : "This can take up to 10 minutes"}
              </p>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                Generate New Batch
              </DialogTitle>
              <DialogDescription>
                {testMode
                  ? `Generate ${effectiveCount} test posts (2 per category, ${scopeLabel.toLowerCase()}) to review content quality and image templates before committing to a full batch.`
                  : `Generate ${effectiveCount} AI-written posts (${scopeLabel.toLowerCase()}) as a new numbered batch. You can review and edit them before approving.`}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {/* Notes — read-only. Every unconsumed note in scope is offered
                  automatically, so there is nothing to pick here. */}
              {noteCounts && (
                <div className="flex items-start gap-2 rounded-lg border bg-gray-50 p-3">
                  <NotebookPen className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div className="min-w-0">
                    {offeredNoteTotal > 0 ? (
                      <>
                        <p className="text-sm font-medium text-gray-900">
                          {offeredNotes
                            .filter((n) => n.count > 0)
                            .map((n) => `${n.count} ${n.scope}`)
                            .join(" · ")}{" "}
                          note{offeredNoteTotal === 1 ? "" : "s"} available
                        </p>
                        <p className="text-xs text-gray-500">
                          Used automatically, ahead of headlines. A note is
                          only used up if a post actually uses it.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-900">
                          No notes waiting
                        </p>
                        <p className="text-xs text-gray-500">
                          Posts will draw on headlines and evergreen material.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Headlines — optional. Scanned on demand, and only the items
                  ticked here reach the prompt. */}
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">Headlines</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleScanHeadlines}
                    disabled={scanning}
                  >
                    {scanning ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Newspaper className="h-4 w-4 mr-1.5 text-blue-600" />
                    )}
                    {scanning
                      ? "Scanning…"
                      : headlines.length > 0
                      ? "Rescan"
                      : "Scan headlines"}
                  </Button>
                </div>

                {scanError && (
                  <p className="text-xs text-red-600">{scanError}</p>
                )}

                {headlines.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    Optional. Finds recent crypto, AI/tech, and AI-in-voice
                    stories so posts can reference real events instead of
                    inventing them. Nothing is used unless you tick it.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                    {HEADLINE_FEEDS.filter((feed) =>
                      headlines.some((h) => h.feed === feed)
                    ).map((feed) => (
                      <div key={feed} className="space-y-1.5">
                        <p className="text-xs font-medium uppercase text-gray-400">
                          {FEED_LABELS[feed]}
                        </p>
                        {headlines
                          .filter((h) => h.feed === feed)
                          .map((item) => (
                            <div key={item.id} className="flex gap-2">
                              <Checkbox
                                id={`headline-${item.id}`}
                                checked={pickedIds.includes(item.id)}
                                onCheckedChange={() => togglePicked(item.id)}
                                className="mt-0.5"
                              />
                              <Label
                                htmlFor={`headline-${item.id}`}
                                className="text-xs font-normal cursor-pointer leading-snug"
                              >
                                {item.headline}
                                <span className="block text-gray-400">
                                  {item.source_name || "Unknown source"}
                                  {item.published_date
                                    ? ` · ${item.published_date}`
                                    : ""}
                                  {item.source_url && (
                                    <a
                                      href={item.source_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="ml-1 inline-flex items-center text-blue-600 hover:underline"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </span>
                              </Label>
                            </div>
                          ))}
                      </div>
                    ))}
                    <p className="text-xs text-gray-400 pt-1">
                      {pickedIds.length} picked. Used by AI, Tech, POTS, and
                      Personal Take only.
                    </p>
                  </div>
                )}
              </div>

              {/* Batch size. Test mode ignores it, so it's hidden there. */}
              {!testMode && (
                <div className="space-y-2">
                  <Label htmlFor="postCount">Posts</Label>
                  <Select value={postCount} onValueChange={setPostCount}>
                    <SelectTrigger id="postCount">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POST_COUNT_PRESETS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} posts
                          {POST_COUNT_HINTS[n] ? ` · ${POST_COUNT_HINTS[n]}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400">
                    Spread evenly Monday to Friday. This is the exact count for
                    whichever scope you pick.
                  </p>
                </div>
              )}

              {/* Scope — a radio group built from buttons so it needs no new
                  dependency. role/aria-checked keep it a real radio group. */}
              <div className="space-y-2">
                <Label>Scope</Label>
                <div role="radiogroup" aria-label="Batch scope" className="grid gap-1.5">
                  {SCOPE_OPTIONS.map((option) => {
                    const selected = scope === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setScope(option.value)}
                        className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
                          selected
                            ? "border-blue-600 bg-blue-50"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            selected ? "border-blue-600" : "border-gray-300"
                          }`}
                        >
                          {selected && (
                            <span className="h-2 w-2 rounded-full bg-blue-600" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900">
                            {option.label}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {option.hint} &middot;{" "}
                            {testMode
                              ? SCOPE_TEST_COUNTS[option.value]
                              : chosenSize}{" "}
                            posts
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="testMode"
                  checked={testMode}
                  onCheckedChange={(checked) => setTestMode(checked === true)}
                />
                <Label htmlFor="testMode" className="text-sm font-normal cursor-pointer">
                  Test mode ({effectiveCount} posts — 2 per category, faster generation)
                </Label>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-md p-3">
                  {error}
                </p>
              )}

              <Button
                onClick={handleGenerate}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {testMode
                  ? `Generate ${effectiveCount} Test Posts`
                  : `Generate ${effectiveCount} Posts`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
