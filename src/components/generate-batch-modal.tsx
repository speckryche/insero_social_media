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
                {testMode ? "Generating 10 test posts..." : "Generating 60 posts..."}
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
                  ? "Generate 10 test posts (2 per category, all five) to review content quality and image templates before committing to a full batch."
                  : "Generate 60 AI-written posts (2 per day for 30 days). You can review and edit them before approving."}
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

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="testMode"
                  checked={testMode}
                  onCheckedChange={(checked) => setTestMode(checked === true)}
                />
                <Label htmlFor="testMode" className="text-sm font-normal cursor-pointer">
                  Test mode (10 posts — 2 per category, faster generation)
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
                {testMode ? "Generate 10 Test Posts" : "Generate 60 Posts"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
