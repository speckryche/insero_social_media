// Real-life notes: the running dated list Speck adds to as things happen.
// Batch generation offers the unconsumed ones to the prompt as primary
// material, ahead of headlines. A note is consumed when a post actually uses
// it — being offered is not enough, so anything the model passed over returns
// to the pool next batch.
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

// The columns generation reads off real_life_notes. Deliberately narrower than
// the row: consumed/consumed_at/consumed_by_batch_id are write-only from the
// generator's side, and nothing in a prompt should see them.
export interface RealLifeNote {
  id: string;
  content: string;
  note_date: string;
  scope: NoteScope;
}

// How many notes each scope may put in front of the model. Company notes are
// offered to all five company categories at once, so the cap is tighter — the
// same eight notes are repeated across five prompts. Personal notes reach only
// personal_take, so they can go deeper.
export const NOTES_PER_SCOPE: Record<NoteScope, number> = {
  company: 8,
  personal: 12,
};

// Which scope's notes each content category draws on. Mirrors
// FEEDS_BY_CATEGORY in headlines.ts. Unlike headlines, every category is
// covered — there is no equivalent of quote_speak's "no news, ever".
export const NOTE_SCOPE_BY_CATEGORY: Record<string, NoteScope> = {
  ai_speak: "company",
  tech_speak: "company",
  quote_speak: "company",
  cost_speak: "company",
  pots_speak: "company",
  personal_take: "personal",
};

/**
 * The notes one category is allowed to see, in the order they were passed.
 *
 * Both the prompt builder and the write-back resolver call this, so a post's
 * 1-based note_index means the same thing on both sides. Deriving that list
 * twice by hand is what makes the headline_index round-trip fragile; do not
 * reintroduce that here.
 */
export function notesForCategory(
  category: string,
  notes: RealLifeNote[]
): RealLifeNote[] {
  const scope = NOTE_SCOPE_BY_CATEGORY[category];
  if (!scope) return [];
  return notes.filter((note) => note.scope === scope);
}

/** Today as YYYY-MM-DD in local time — `new Date().toISOString()` would use UTC. */
export function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
