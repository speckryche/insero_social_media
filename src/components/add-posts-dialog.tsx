"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Loader2, Plus, CheckCircle2 } from "lucide-react";
import { SLOTS_PER_WEEK, formatWeekRange } from "@/lib/week";

// Categories by batch scope. A NULL scope predates the column and covered
// everything, same as "both".
const COMPANY_CATEGORIES = [
  { value: "ai_speak", label: "AI Speak" },
  { value: "tech_speak", label: "Tech Speak" },
  { value: "quote_speak", label: "Quote Speak" },
  { value: "cost_speak", label: "Cost Speak" },
  { value: "pots_speak", label: "POTS Speak" },
];

const PERSONAL_CATEGORY = { value: "personal_take", label: "Personal Take" };

export function categoriesForScope(scope: string | null | undefined) {
  if (scope === "company") return COMPANY_CATEGORIES;
  if (scope === "personal") return [PERSONAL_CATEGORY];
  return [...COMPANY_CATEGORIES, PERSONAL_CATEGORY];
}

const COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface AddPostsDialogProps {
  batchId: string;
  scope: string | null | undefined;
  /** The batch's Monday, or null for a legacy monthly batch. */
  weekStart?: string | null;
  onClose: () => void;
  onAdded: () => void;
}

export function AddPostsDialog({
  batchId,
  scope,
  weekStart = null,
  onClose,
  onAdded,
}: AddPostsDialogProps) {
  const options = categoriesForScope(scope);

  const [category, setCategory] = useState(options[0].value);
  const [count, setCount] = useState("3");
  const [useHeadlines, setUseHeadlines] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  // A weekly batch shares its week with any other batch in the same scope
  // lane, so what is actually addable is whatever that lane has left. Read it
  // from the generate route — the same source the Generate dialog uses and the
  // same logic the add-posts route enforces — rather than counting here.
  const [slotsFree, setSlotsFree] = useState<number | null>(null);

  useEffect(() => {
    if (!weekStart) return;
    let cancelled = false;

    fetch(
      `/api/generate-batch?weekStart=${encodeURIComponent(weekStart)}&scope=${scope || "both"}`
    )
      .then(async (res) => {
        const data = await res.json();
        if (!cancelled && res.ok) setSlotsFree(data.slotsFree);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [weekStart, scope]);

  // Never offer more than the week can take. Legacy monthly batches keep the
  // full range, since a month has slots to spare.
  const maxAddable = weekStart && slotsFree !== null ? slotsFree : COUNTS.length;
  const countOptions = COUNTS.filter((n) => n <= Math.max(maxAddable, 1));
  const noSlots = weekStart !== null && slotsFree === 0;

  async function handleAdd() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/batches/${batchId}/add-posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          count: parseInt(count),
          useHeadlines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add posts");
      setAdded(data.added ?? 0);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open && !loading) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-blue-600" />
            Add posts
          </DialogTitle>
          <DialogDescription>
            {added !== null
              ? "Added to this batch."
              : weekStart
              ? `Generates more posts into this batch, scheduled into unused slots in ${formatWeekRange(weekStart)}.`
              : "Generates more posts into this batch, scheduled into unused slots in the month."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
            <p className="text-sm text-gray-700">
              Writing {count} {options.find((o) => o.value === category)?.label}{" "}
              {parseInt(count) === 1 ? "post" : "posts"}…
            </p>
            <p className="text-xs text-gray-400">This takes about a minute.</p>
          </div>
        ) : added !== null ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <p className="text-sm text-gray-700">
              Added {added} {added === 1 ? "post" : "posts"}.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="add-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-count">Posts</Label>
              <Select value={count} onValueChange={setCount}>
                <SelectTrigger id="add-count">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {countOptions.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {weekStart && (
                <p className="text-xs text-gray-400">
                  {slotsFree === null
                    ? "Checking slots…"
                    : `${slotsFree} of ${SLOTS_PER_WEEK} slots free this week.`}
                </p>
              )}
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="add-headlines"
                checked={useHeadlines}
                onCheckedChange={(v) => setUseHeadlines(v === true)}
              />
              <Label
                htmlFor="add-headlines"
                className="text-sm font-normal cursor-pointer leading-snug"
              >
                Use picked headlines
                <span className="block text-xs text-gray-400">
                  Reuses the picks from the most recent scan for this week.
                  Only some categories accept headlines.
                </span>
              </Label>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-md p-3">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {added !== null ? (
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          ) : (
            <>
              <Button onClick={onClose} variant="outline" disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                disabled={loading || noSlots}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1.5" />
                )}
                {noSlots ? "Week is full" : `Add ${count}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
