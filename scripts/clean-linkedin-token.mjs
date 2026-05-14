// One-off cleanup — strip embedded whitespace (newlines, tabs, spaces) from
// the LinkedIn access_token stored in platform_tokens, validate the result
// as an HTTP header value, then UPDATE the row.
//
// Idempotent. Safe to run more than once.
//
// Run with:
//   node --env-file=.env.local scripts/clean-linkedin-token.mjs

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: row, error: readErr } = await supabase
  .from("platform_tokens")
  .select("access_token")
  .eq("platform", "linkedin")
  .single();

if (readErr || !row) {
  console.error("Could not read platform_tokens.linkedin:", readErr);
  process.exit(1);
}

const original = row.access_token;
if (!original) {
  console.error("access_token is NULL — nothing to clean.");
  process.exit(1);
}

// Strip every whitespace character anywhere in the string. LinkedIn member
// tokens are URL-safe base64-ish — no internal whitespace is ever valid.
const cleaned = original.replace(/\s+/g, "");

console.log(`original length: ${original.length}`);
console.log(`cleaned length:  ${cleaned.length}`);
console.log(`bytes stripped:  ${original.length - cleaned.length}`);

if (cleaned === original) {
  console.log("\nNo whitespace found — token is already clean. Nothing to do.");
  process.exit(0);
}

// Validate the cleaned value is actually a legal HTTP header value before
// writing it back. If this throws we abort without touching the DB.
try {
  const h = new Headers();
  h.set("Authorization", `Bearer ${cleaned}`);
  console.log("Headers.set on cleaned value: OK");
} catch (err) {
  console.error(`Cleaned value still rejected by Headers.set: ${err.message}`);
  console.error("Aborting without writing to the DB.");
  process.exit(1);
}

const { error: writeErr } = await supabase
  .from("platform_tokens")
  .update({ access_token: cleaned, updated_at: new Date().toISOString() })
  .eq("platform", "linkedin");

if (writeErr) {
  console.error("UPDATE failed:", writeErr);
  process.exit(1);
}

// Read it back to confirm the round-trip is clean.
const { data: verify } = await supabase
  .from("platform_tokens")
  .select("access_token")
  .eq("platform", "linkedin")
  .single();

if (verify?.access_token === cleaned) {
  console.log("\nUPDATE succeeded. Stored value verified character-for-character with cleaned value.");
} else if (verify?.access_token) {
  console.warn("\nUPDATE wrote a row but the readback differs from the cleaned value.");
  console.warn(`  cleaned len: ${cleaned.length}`);
  console.warn(`  readback len: ${verify.access_token.length}`);
} else {
  console.warn("\nUPDATE wrote but readback returned no row.");
}
