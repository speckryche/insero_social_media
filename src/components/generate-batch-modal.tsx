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
    }, 8000);

    try {
      const res = await fetch("/api/generate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: parseInt(month),
          year: parseInt(year),
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
    <Dialog open={open} onOpenChange={(v) => { if (!loading) setOpen(v); }}>
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
        {loading ? (
          <div className="flex flex-col items-center py-10 gap-4">
            <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
            <div className="text-center">
              <p className="font-medium text-gray-900">
                Generating 60 posts...
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {PROGRESS_MESSAGES[progressIndex]}
              </p>
              <p className="text-xs text-gray-400 mt-3">
                This takes about 30-60 seconds
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
                Generate 60 AI-written posts (2 per day for 30 days). You can
                review and edit them before approving.
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

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-md p-3">
                  {error}
                </p>
              )}

              <Button
                onClick={handleGenerate}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                Generate 60 Posts
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
