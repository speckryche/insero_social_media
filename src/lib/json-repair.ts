// Cleanup for JSON that came back from the model. Shared by batch generation
// and the learn-from-edits analyzer — both ask for a bare JSON array and both
// occasionally get fences or raw newlines inside string values.

// Strips markdown code fences the model sometimes adds despite being told not
// to. Handles both a fenced whole response and stray prose around the array.
export function stripCodeFences(raw: string): string {
  let text = raw.trim();

  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    text = text.trim();
  }

  // If anything still surrounds the array, keep only the array itself.
  if (!text.startsWith("[")) {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end > start) {
      text = text.slice(start, end + 1);
    }
  }

  return text;
}

// The model writes multi-paragraph text, and it occasionally emits a real
// newline inside a JSON string value instead of \n — which makes JSON.parse
// fail with "Unterminated string in JSON at position N". Walk the text and
// escape raw control characters that appear inside string values, leaving
// structural whitespace between tokens untouched.
export function escapeRawControlCharsInStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (const ch of text) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }

    if (inString) {
      if (ch === "\n") {
        out += "\\n";
        continue;
      }
      if (ch === "\r") {
        out += "\\r";
        continue;
      }
      if (ch === "\t") {
        out += "\\t";
        continue;
      }
    }

    out += ch;
  }

  return out;
}
