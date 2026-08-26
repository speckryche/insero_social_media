// Presentation for batches.scope, shared by the batch header and the Batches
// list so the two can't drift apart.
//
// A NULL scope means the batch predates migration 013 and covers everything,
// which is the same thing "both" means.

export const BATCH_SCOPE_LABELS: Record<string, string> = {
  both: "Company + Personal",
  company: "Company only",
  personal: "Personal only",
};

export const BATCH_SCOPE_STYLES: Record<string, string> = {
  both: "bg-slate-100 text-slate-700 border-slate-200",
  company: "bg-blue-100 text-blue-800 border-blue-200",
  personal: "bg-violet-100 text-violet-800 border-violet-200",
};

export function batchScopeKey(scope: string | null | undefined): string {
  return scope && BATCH_SCOPE_LABELS[scope] ? scope : "both";
}
