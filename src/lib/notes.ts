// Real-life notes: the running dated list Speck adds to as things happen.
// A later change wires these into batch generation; for now they are just
// captured and managed.
//
// Client-safe: no imports, no Node-only anything.

export type NoteScope = "company" | "personal";

export function isNoteScope(value: unknown): value is NoteScope {
  return value === "company" || value === "personal";
}

/** YYYY-MM-DD, the shape note_date stores. */
export function isISODate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Personal is blue and company green, the same pairing the post cards use.
export const NOTE_SCOPE_STYLES: Record<NoteScope, string> = {
  personal: "bg-blue-100 text-blue-800",
  company: "bg-green-100 text-green-800",
};

export const NOTE_SCOPE_LABELS: Record<NoteScope, string> = {
  personal: "Personal",
  company: "Company",
};

/** Today as YYYY-MM-DD in local time — `new Date().toISOString()` would use UTC. */
export function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
