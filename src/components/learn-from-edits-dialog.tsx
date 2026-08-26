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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Check, X, Sparkles, CheckCircle2, ArrowRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface Proposal {
  type: "ban" | "speckism" | "swap";
  text?: string;
  from?: string;
  to?: string;
  reason: string;
  evidence_count: number;
  high_confidence?: boolean;
}

interface LearnFromEditsDialogProps {
  batchId: string;
  onClose: () => void;
}

type Decision = "pending" | "accepted" | "dismissed";

const TYPE_LABELS: Record<Proposal["type"], string> = {
  ban: "Banned word",
  speckism: "Speck-ism",
  swap: "Word swap",
};

const TYPE_STYLES: Record<Proposal["type"], string> = {
  ban: "bg-rose-100 text-rose-800 border-rose-200",
  speckism: "bg-violet-100 text-violet-800 border-violet-200",
  swap: "bg-amber-100 text-amber-800 border-amber-200",
};

export function LearnFromEditsDialog({
  batchId,
  onClose,
}: LearnFromEditsDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editCount, setEditCount] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [done, setDone] = useState<number | null>(null);
  const [samplesAdded, setSamplesAdded] = useState(0);
  // Checked by default: the posts Speck rewrote are the best style signal
  // available, and saving them is additive and reversible in Settings.
  const [saveStyleSamples, setSaveStyleSamples] = useState(true);

  // Kick off the analysis as soon as the dialog opens. The cancelled flag
  // keeps StrictMode's double-invoke from writing state twice.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/batches/${batchId}/learn`, {
          method: "POST",
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Analysis failed");
        setProposals(data.proposals || []);
        setDecisions((data.proposals || []).map(() => "pending" as Decision));
        setRunId(data.runId || null);
        setEditCount(data.editCount || 0);
        setMessage(data.message || null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [batchId]);

  function decide(index: number, decision: Decision) {
    setDecisions((prev) => {
      const next = [...prev];
      next[index] = next[index] === decision ? "pending" : decision;
      return next;
    });
  }

  const acceptedCount = decisions.filter((d) => d === "accepted").length;

  async function handleApply() {
    setSaving(true);
    setError(null);
    try {
      const accepted = proposals.filter((_, i) => decisions[i] === "accepted");
      const res = await fetch(`/api/batches/${batchId}/learn`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, accepted, saveStyleSamples }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setDone(data.acceptedCount ?? accepted.length);
      setSamplesAdded(data.styleSamplesAdded ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            Learn from my edits
          </DialogTitle>
          <DialogDescription>
            {loading
              ? "Comparing what was written against what you approved…"
              : done !== null
              ? "Settings updated."
              : proposals.length > 0
              ? `Found ${proposals.length} pattern${
                  proposals.length === 1 ? "" : "s"
                } across ${editCount} edited post${editCount === 1 ? "" : "s"}. Nothing is applied until you accept it.`
              : "Nothing to propose yet."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
            <p className="text-sm text-gray-500">This takes a few seconds.</p>
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-md p-3">{error}</p>
        ) : done !== null ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <p className="text-sm text-gray-700">
              {done === 0 && samplesAdded === 0
                ? "No changes made — nothing was accepted."
                : [
                    done > 0
                      ? `Added ${done} item${done === 1 ? "" : "s"} to your Settings lists.`
                      : null,
                    samplesAdded > 0
                      ? `Saved ${samplesAdded} style sample${
                          samplesAdded === 1 ? "" : "s"
                        }.`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
            </p>
          </div>
        ) : proposals.length === 0 ? (
          <p className="text-sm text-gray-600 py-6">
            {message ||
              "No repeated patterns found in this batch's edits. Edit a few more posts and run this again."}{" "}
            You can still save your edited personal posts as style samples
            below.
          </p>
        ) : (
          <ScrollArea className="max-h-[50vh] pr-3">
            <div className="space-y-2">
              {proposals.map((proposal, i) => {
                const decision = decisions[i];
                return (
                  <div
                    key={`${proposal.type}-${proposal.text}-${i}`}
                    className={`rounded-lg border p-3 transition-colors ${
                      decision === "accepted"
                        ? "border-green-300 bg-green-50"
                        : decision === "dismissed"
                        ? "border-gray-200 bg-gray-50 opacity-60"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-xs ${TYPE_STYLES[proposal.type]}`}
                          >
                            {TYPE_LABELS[proposal.type]}
                          </Badge>
                          <span className="text-xs text-gray-400">
                            {proposal.evidence_count}{" "}
                            {proposal.evidence_count === 1 ? "edit" : "edits"}
                          </span>
                          {proposal.evidence_count === 1 &&
                            proposal.high_confidence && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-amber-50 text-amber-700 border-amber-200"
                              >
                                Notable
                              </Badge>
                            )}
                        </div>
                        {proposal.type === "swap" ? (
                          <div className="flex items-center gap-2 flex-wrap text-sm">
                            <span className="font-medium text-gray-500 line-through break-words">
                              {proposal.from}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            <span className="font-medium text-gray-900 break-words">
                              {proposal.to}
                            </span>
                          </div>
                        ) : (
                          <p className="text-sm font-medium text-gray-900 break-words">
                            {proposal.text}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">{proposal.reason}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant={decision === "accepted" ? "default" : "outline"}
                          size="sm"
                          className={`text-xs h-7 px-2 ${
                            decision === "accepted"
                              ? "bg-green-600 hover:bg-green-700"
                              : ""
                          }`}
                          onClick={() => decide(i, "accepted")}
                        >
                          <Check className="h-3.5 w-3.5 mr-0.5" />
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={() => decide(i, "dismissed")}
                        >
                          <X className="h-3.5 w-3.5 mr-0.5" />
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {!loading && !error && done === null && (
          <div className="flex items-start space-x-2 border-t pt-3">
            <Checkbox
              id="saveStyleSamples"
              checked={saveStyleSamples}
              onCheckedChange={(v) => setSaveStyleSamples(v === true)}
            />
            <Label
              htmlFor="saveStyleSamples"
              className="text-sm font-normal cursor-pointer leading-snug"
            >
              Save my edited personal posts as style samples
              <span className="block text-xs text-gray-400">
                Adds every edited-and-approved Personal Take post from this
                batch to Settings, deduped, newest 40 kept.
              </span>
            </Label>
          </div>
        )}

        <DialogFooter>
          {done !== null || error ? (
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          ) : (
            <>
              <Button onClick={onClose} variant="outline" disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={handleApply}
                disabled={saving || (acceptedCount === 0 && !saveStyleSamples)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1.5" />
                )}
                {acceptedCount > 0
                  ? `Add ${acceptedCount} to Settings`
                  : "Add to Settings"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
