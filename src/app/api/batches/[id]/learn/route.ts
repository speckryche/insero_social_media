import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { parseListSetting } from "@/lib/prompts";
import {
  stripCodeFences,
  escapeRawControlCharsInStrings,
} from "@/lib/json-repair";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// "ban" and "speckism" carry `text`; "swap" carries `from` / `to` instead.
export interface Proposal {
  type: "ban" | "speckism" | "swap";
  text?: string;
  from?: string;
  to?: string;
  reason: string;
  evidence_count: number;
  // Set by the model on a single-edit proposal it is confident about. At most
  // one of these survives per run.
  high_confidence?: boolean;
}

// Two edits is the floor for a pattern. One edit is a one-off — allowed only
// as a single flagged exception per run.
const MIN_EVIDENCE = 2;
const MAX_NOTABLE_SINGLES = 1;

// How many style samples to keep. Oldest fall off the front.
const MAX_STYLE_SAMPLES = 40;

// Comparison key for "already proposed" / "already on the list" checks.
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// A swap's `to` earns a Speck-ism only when it is a distinctive phrase rather
// than a plain one-word substitution. "folks" -> "people" is just a ban;
// "reach out" -> "give me a shout" is a habit worth recording.
function isDistinctivePhrase(text: string): boolean {
  return text.trim().split(/\s+/).length > 1;
}

// The identity of a proposal, for dedupe across runs.
function proposalKey(p: Proposal): string {
  if (p.type === "swap") {
    return `swap:${normalize(p.from || "")}->${normalize(p.to || "")}`;
  }
  return normalize(p.text || "");
}

function isProposal(value: unknown): value is Proposal {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  if (typeof p.reason !== "string" || typeof p.evidence_count !== "number") {
    return false;
  }
  if (p.type === "swap") {
    return (
      typeof p.from === "string" &&
      p.from.trim().length > 0 &&
      typeof p.to === "string" &&
      p.to.trim().length > 0
    );
  }
  return (
    (p.type === "ban" || p.type === "speckism") &&
    typeof p.text === "string" &&
    p.text.trim().length > 0
  );
}

const SYSTEM_PROMPT = `You analyze how a human editor changes AI-written social posts, and propose additions to two editable lists that steer future generation.

- "Banned words" — words or phrases the editor consistently removes or replaces. These are injected into every prompt as things never to use.
- "Speck-isms" — habits of speech the editor consistently adds. These are injected into personal-profile posts only, as habits rather than lines to copy.

Three proposal types:
- "ban" — a word or phrase to stop using. Carries "text".
- "speckism" — a habit of speech to adopt. Carries "text".
- "swap" — the editor replaced the same word or phrase with the same replacement across several edits. Carries "from" and "to" instead of "text" (e.g. from "folks", to "people").

Rules:
- Propose ONLY patterns supported by at least ${MIN_EVIDENCE} separate edits. One-off changes are not patterns.
- ONE exception: you may include at most ${MAX_NOTABLE_SINGLES} proposal backed by a single edit if it is unmistakable and you are highly confident. Mark it "high_confidence": true and set evidence_count to 1. If nothing meets that bar, do not include one.
- Prefer a "swap" over a bare "ban" when the editor clearly substituted one thing for another — the replacement is the useful half.
- Never propose something already present in either list you are given.
- A "ban" proposal is a short word or phrase, not a sentence of advice.
- A "speckism" proposal is a short description of a habit, not a line to copy.
- Prefer few, high-confidence proposals over many weak ones. Returning an empty array is a correct answer when the edits show no repeated pattern.
- evidence_count is the number of distinct edits supporting the proposal.

You must respond with valid JSON only. No markdown, no code fences, no extra text.`;

interface EditPair {
  variant: "company" | "personal";
  postNumber: number;
  before: string;
  after: string;
}

function collectEdits(posts: Record<string, unknown>[]): EditPair[] {
  const edits: EditPair[] = [];

  for (const post of posts) {
    const postNumber = Number(post.post_number) || 0;

    const companyBefore = (post.original_linkedin_content as string) || "";
    const companyAfter = (post.linkedin_content as string) || "";
    if (companyBefore && companyAfter && companyBefore !== companyAfter) {
      edits.push({
        variant: "company",
        postNumber,
        before: companyBefore,
        after: companyAfter,
      });
    }

    const personalBefore =
      (post.original_linkedin_personal_content as string) || "";
    const personalAfter = (post.linkedin_personal_content as string) || "";
    if (personalBefore && personalAfter && personalBefore !== personalAfter) {
      edits.push({
        variant: "personal",
        postNumber,
        before: personalBefore,
        after: personalAfter,
      });
    }
  }

  return edits;
}

// POST — analyze this batch's edits and record a learn_run of the proposals.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();

    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select(
        "post_number, linkedin_content, linkedin_personal_content, original_linkedin_content, original_linkedin_personal_content"
      )
      .eq("batch_id", params.id)
      .order("post_number", { ascending: true });

    if (postsError) {
      return NextResponse.json({ error: postsError.message }, { status: 500 });
    }

    const edits = collectEdits(posts || []);

    if (edits.length < MIN_EVIDENCE) {
      return NextResponse.json({
        proposals: [],
        editCount: edits.length,
        message:
          edits.length === 0
            ? "No edited posts in this batch yet — edit a few and run this again."
            : `Only ${edits.length} edited post so far. At least ${MIN_EVIDENCE} are needed to spot a pattern.`,
      });
    }

    const { data: settings } = await supabase
      .from("app_settings")
      .select("banned_words, speck_isms")
      .single();

    const bannedWords = parseListSetting(settings?.banned_words);
    const speckIsms = parseListSetting(settings?.speck_isms);

    // Everything already shown on a previous run for this batch, accepted or
    // not. Re-running should not surface the same proposal twice.
    const { data: priorRuns } = await supabase
      .from("learn_runs")
      .select("proposals")
      .eq("batch_id", params.id);

    const alreadySeen = new Set<string>();
    for (const run of priorRuns || []) {
      for (const proposal of (run.proposals as Proposal[]) || []) {
        if (proposal?.type) alreadySeen.add(proposalKey(proposal));
      }
    }
    // Anything already on a list counts as seen — including a swap whose
    // "from" is already banned, which would be redundant.
    const onAList = new Set<string>();
    for (const word of [...bannedWords, ...speckIsms]) {
      alreadySeen.add(normalize(word));
      onAList.add(normalize(word));
    }

    const editBlocks = edits
      .map(
        (edit, i) =>
          `EDIT ${i + 1} (post #${edit.postNumber}, ${edit.variant} variant)
BEFORE:
${edit.before}

AFTER:
${edit.after}`
      )
      .join("\n\n---\n\n");

    const userPrompt = `Current Banned words list:
${bannedWords.length ? bannedWords.map((w) => `- ${w}`).join("\n") : "(empty)"}

Current Speck-isms list:
${speckIsms.length ? speckIsms.map((w) => `- ${w}`).join("\n") : "(empty)"}

Already proposed on an earlier run — do not propose any of these again:
${alreadySeen.size ? Array.from(alreadySeen).map((w) => `- ${w}`).join("\n") : "(none)"}

Here are ${edits.length} edits, each showing what the model wrote and what the editor approved:

${editBlocks}

Return a JSON array of proposals. Use one of these two shapes per object:
[
  {
    "type": "ban" or "speckism",
    "text": "...",
    "reason": "one sentence on what the edits show",
    "evidence_count": 2
  },
  {
    "type": "swap",
    "from": "the word or phrase that was replaced",
    "to": "what it was replaced with",
    "reason": "one sentence on what the edits show",
    "evidence_count": 2
  }
]

Add "high_confidence": true to at most ${MAX_NOTABLE_SINGLES} object if it rests on a single edit you are certain about.

Return ONLY the JSON array. No markdown fences, no explanation, no extra text.`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const message = await anthropic.messages
      .stream({
        model: "claude-sonnet-5",
        max_tokens: 16000,
        output_config: { effort: "medium" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      })
      .finalMessage();

    if (message.stop_reason === "max_tokens") {
      return NextResponse.json(
        {
          error:
            "The analysis was cut off at the token limit (stop_reason: max_tokens). Try again with fewer edited posts.",
        },
        { status: 500 }
      );
    }

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No text response from the analysis." },
        { status: 500 }
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(
        escapeRawControlCharsInStrings(stripCodeFences(textBlock.text))
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Could not parse the analysis response (${reason}).` },
        { status: 500 }
      );
    }

    // Belt and braces: the prompt states these rules, and we enforce them here
    // too so a sloppy response cannot slip past.
    const cleaned = (Array.isArray(raw) ? raw : [])
      .filter(isProposal)
      .map((p) => ({
        ...p,
        text: p.text?.trim(),
        from: p.from?.trim(),
        to: p.to?.trim(),
      }))
      .filter((p) => !alreadySeen.has(proposalKey(p)))
      // A swap whose "from" is already banned adds nothing.
      .filter((p) => p.type !== "swap" || !onAList.has(normalize(p.from || "")));

    // Everything at or above the threshold, plus at most one flagged single.
    const strong = cleaned.filter((p) => p.evidence_count >= MIN_EVIDENCE);
    const notable = cleaned
      .filter((p) => p.evidence_count === 1 && p.high_confidence === true)
      .slice(0, MAX_NOTABLE_SINGLES);
    const proposals = [...strong, ...notable];

    const { data: run, error: runError } = await supabase
      .from("learn_runs")
      .insert({ batch_id: params.id, proposals, accepted: [] })
      .select()
      .single();

    if (runError) {
      return NextResponse.json({ error: runError.message }, { status: 500 });
    }

    return NextResponse.json({
      runId: run.id,
      proposals,
      editCount: edits.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// PATCH — accept a subset of a run's proposals, appending them to the matching
// Settings list. Nothing is ever applied without this call.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { runId, accepted, saveStyleSamples } = await request.json();

    if (!runId || !Array.isArray(accepted)) {
      return NextResponse.json(
        { error: "runId and accepted[] are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const chosen = accepted.filter(isProposal);

    const { data: settings, error: settingsError } = await supabase
      .from("app_settings")
      .select("id, banned_words, speck_isms, style_samples")
      .single();

    if (settingsError || !settings) {
      return NextResponse.json(
        { error: settingsError?.message || "Settings not found" },
        { status: 500 }
      );
    }

    const bannedWords = parseListSetting(settings.banned_words);
    const speckIsms = parseListSetting(settings.speck_isms);
    const existing = new Set([
      ...bannedWords.map(normalize),
      ...speckIsms.map(normalize),
    ]);

    const addBan = (text: string) => {
      const value = text.trim();
      if (!value || existing.has(normalize(value))) return;
      existing.add(normalize(value));
      bannedWords.push(value);
    };
    const addSpeckIsm = (text: string) => {
      const value = text.trim();
      if (!value || existing.has(normalize(value))) return;
      existing.add(normalize(value));
      speckIsms.push(value);
    };

    for (const proposal of chosen) {
      if (proposal.type === "swap") {
        const from = (proposal.from || "").trim();
        const to = (proposal.to || "").trim();
        if (!from) continue;
        // The replaced word gets banned either way. The replacement only
        // becomes a Speck-ism when it is a phrase worth imitating.
        addBan(from);
        if (to && isDistinctivePhrase(to)) {
          addSpeckIsm(`replaces '${from}' with '${to}'`);
        }
        continue;
      }

      const text = (proposal.text || "").trim();
      if (!text) continue;
      if (proposal.type === "ban") {
        addBan(text);
      } else {
        addSpeckIsm(text);
      }
    }

    // Optionally fold this batch's edited-and-approved personal posts into the
    // style samples. Newlines are flattened because the column is one entry
    // per line.
    let styleSamples = parseListSetting(settings.style_samples);
    let styleSamplesAdded = 0;

    if (saveStyleSamples) {
      const { data: personalPosts } = await supabase
        .from("posts")
        .select(
          "post_number, linkedin_personal_content, original_linkedin_personal_content, linkedin_personal_approved"
        )
        .eq("batch_id", params.id)
        .eq("linkedin_personal_approved", true)
        .order("post_number", { ascending: true });

      const seenSamples = new Set(styleSamples.map(normalize));

      for (const post of personalPosts || []) {
        const after = (post.linkedin_personal_content as string) || "";
        const before =
          (post.original_linkedin_personal_content as string) || "";
        if (!after || after === before) continue;

        const flattened = after.replace(/\s+/g, " ").trim();
        if (!flattened || seenSamples.has(normalize(flattened))) continue;

        seenSamples.add(normalize(flattened));
        styleSamples.push(flattened);
        styleSamplesAdded++;
      }

      // Keep the most recent MAX_STYLE_SAMPLES; oldest fall off the front.
      if (styleSamples.length > MAX_STYLE_SAMPLES) {
        styleSamples = styleSamples.slice(-MAX_STYLE_SAMPLES);
      }
    }

    const { error: updateError } = await supabase
      .from("app_settings")
      .update({
        banned_words: bannedWords.join("\n"),
        speck_isms: speckIsms.join("\n"),
        ...(saveStyleSamples
          ? { style_samples: styleSamples.join("\n") }
          : {}),
      })
      .eq("id", settings.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { error: runError } = await supabase
      .from("learn_runs")
      .update({ accepted: chosen })
      .eq("id", runId)
      .eq("batch_id", params.id);

    if (runError) {
      return NextResponse.json({ error: runError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      acceptedCount: chosen.length,
      styleSamplesAdded,
      bannedWords,
      speckIsms,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
