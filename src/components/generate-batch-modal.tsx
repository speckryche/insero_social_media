"use client";

import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Sparkles } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PROGRESS_MESSAGES = [
  "Creating batch...",
  'Generating "Did You Know" posts...',
  'Generating "Savings Stories" posts...',
  'Generating "Industry Tips" posts...',
  'Generating "Myth-Busting" posts...',
  'Generating "Personal Takes" posts...',
  "Assigning schedules and images...",
  "Almost done...",
];

type BatchScope = "both" | "company" | "personal";

const SCOPE_OPTIONS: Array<{ value: BatchScope; label: string; hint: string }> = [
  { value: "both", label: "Both", hint: "Company page + Speck's profile" },
  { value: "company", label: "Company only", hint: "The four Telecom-speak categories" },
  { value: "personal", label: "Personal only", hint: "Personal Take posts only" },
];

const POST_COUNT_PRESETS = [10, 20, 30, 40, 50, 60];
const DEFAULT_POST_COUNT = 30;

// Each scope's share of the mix. A scoped batch of size N takes its share of
// N — the same split a Both batch of size N would produce internally.
const SCOPE_SHARE: Record<BatchScope, number> = {
  both: 1,
  company: 0.75,
  personal: 0.25,
};

function scopeCount(scope: BatchScope, postCount: number): number {
  return Math.max(1, Math.round(postCount * SCOPE_SHARE[scope]));
}

// Test mode ignores the size picker: 2 per included category.
const SCOPE_TEST_COUNTS: Record<BatchScope, number> = {
  both: 10,
  company: 8,
  personal: 2,
};

export function GenerateBatchModal() {
  const router = useRouter();
  const now = new Date();
  // Default to next month
  const defaultMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
  const defaultYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();

  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(String(defaultMonth));
  const [year, setYear] = useState(String(defaultYear));
  const [testMode, setTestMode] = useState(false);
  const [scope, setScope] = useState<BatchScope>("both");
  const [postCount, setPostCount] = useState(String(DEFAULT_POST_COUNT));
  const [includeImages, setIncludeImages] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetch("/api/generate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: parseInt(month),
          year: parseInt(year),
          testMode,
          includeImages,
          scope,
          postCount: parseInt(postCount),
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

  const currentYear = now.getFullYear();
  const years = [currentYear, currentYear + 1];

  const chosenSize = parseInt(postCount) || DEFAULT_POST_COUNT;
  const effectiveCount = testMode
    ? SCOPE_TEST_COUNTS[scope]
    : scopeCount(scope, chosenSize);
  const scopeLabel = SCOPE_OPTIONS.find((o) => o.value === scope)!.label;

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
                  : `Generate ${effectiveCount} AI-written posts (${scopeLabel.toLowerCase()}), spread evenly across the month. You can review and edit them before approving.`}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="month">Month</Label>
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger id="month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((name, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger id="year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400">
                    Spread evenly across the month. A scoped batch takes its
                    share — {scopeLabel.toLowerCase()} gives {effectiveCount}.
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
                              : scopeCount(option.value, chosenSize)}{" "}
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

              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="includeImages" className="text-sm font-medium cursor-pointer">
                    Include images
                  </Label>
                  <Switch
                    id="includeImages"
                    checked={includeImages}
                    onCheckedChange={setIncludeImages}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  {includeImages
                    ? "Images will be generated for eligible post categories"
                    : "Posts will be text-only — no images generated"}
                </p>
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
