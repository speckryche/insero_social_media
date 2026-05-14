// Diagnostic script — check the stored LinkedIn access_token for any
// whitespace, control chars, or other formatting that would make it an
// invalid HTTP header value. Read-only; no UPDATEs.
//
// Run with:
//   node --env-file=.env.local scripts/check-linkedin-token.mjs

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from("platform_tokens")
  .select("access_token, refresh_token, expires_at, updated_at")
  .eq("platform", "linkedin")
  .single();

if (error || !data) {
  console.error("Query failed:", error);
  process.exit(1);
}

const t = data.access_token;
if (!t) {
  console.log("access_token is NULL or empty");
  process.exit(1);
}

console.log("=== LinkedIn token diagnostic ===\n");

console.log(`raw length:                ${t.length}`);
console.log(`length after .trim():      ${t.trim().length}`);
console.log(`differs from trimmed:      ${t !== t.trim()}`);
console.log(`includes \\n (LF):          ${t.includes("\n")}`);
console.log(`includes \\r (CR):          ${t.includes("\r")}`);
console.log(`includes \\t (tab):         ${t.includes("\t")}`);
console.log(`includes space:            ${t.includes(" ")}`);
console.log(`includes NUL (\\0):         ${t.includes("\0")}`);
console.log(`starts with whitespace:    ${/^\s/.test(t)}`);
console.log(`ends with whitespace:      ${/\s$/.test(t)}`);

// LinkedIn member-context tokens are URL-safe base64 plus a few separators.
const allowed = /[A-Za-z0-9._~+/=:-]/;
const badChars = [];
for (let i = 0; i < t.length; i++) {
  if (!allowed.test(t[i])) {
    badChars.push({
      index: i,
      char: JSON.stringify(t[i]),
      code: "0x" + t.charCodeAt(i).toString(16),
    });
  }
}
console.log(`unusual chars (not [A-Za-z0-9._~+/=:-]): ${badChars.length}`);
if (badChars.length > 0 && badChars.length <= 30) {
  console.log("  detail:", badChars);
}

// First/last few char codes — easiest way to spot a leading/trailing newline.
console.log("\nfirst 5 char codes:");
for (let i = 0; i < Math.min(5, t.length); i++) {
  console.log(`  [${i}] ${JSON.stringify(t[i])} = 0x${t.charCodeAt(i).toString(16)}`);
}
console.log("last 5 char codes:");
for (let i = Math.max(0, t.length - 5); i < t.length; i++) {
  console.log(`  [${i}] ${JSON.stringify(t[i])} = 0x${t.charCodeAt(i).toString(16)}`);
}

// The smoking gun: try to construct the actual header fetch() would build.
console.log("\nReproducing the header construction fetch does:");
try {
  const h = new Headers();
  h.set("Authorization", `Bearer ${t}`);
  console.log("  Headers.set succeeded — token is valid as a header value.");
} catch (err) {
  console.log(`  Headers.set FAILED: ${err.message}`);
}

// Same test for the trimmed value
try {
  const h = new Headers();
  h.set("Authorization", `Bearer ${t.trim()}`);
  console.log("  Headers.set on .trim()'d value succeeded.");
} catch (err) {
  console.log(`  Headers.set on .trim()'d value FAILED: ${err.message}`);
}

console.log(`\nrefresh_token: ${data.refresh_token === null ? "NULL" : "<set, length " + data.refresh_token.length + ">"}`);
console.log(`expires_at:    ${data.expires_at}`);
console.log(`updated_at:    ${data.updated_at}`);
