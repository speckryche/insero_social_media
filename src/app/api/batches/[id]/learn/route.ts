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

export interface Proposal {
  type: "ban" | "speckism";
  text: string;
  reason: string;
  evidence_count: number;
}

// Two edits is the floor. One edit is a one-off; a pattern needs repetition.
const MIN_EVIDENCE = 2;

// Comparison key for "already proposed" / "already on the list" checks.
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function isProposal(value: unknown): value is Proposal {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    (p.type === "ban" || p.type === "speckism") &&
    typeof p.text === "string" &&
    p.text.trim().length > 0 &&
    typeof p.reason === "string" &&
    typeof p.evidence_count === "number"
  );
}

const SYSTEM_PROMPT = `You analyze how a human editor changes AI-written social posts, and propose additions to two editable lists that steer future generation.

- "Banned words" — words or phrases the editor consistently removes or replaces. These are injected into every prompt as things never to use.
- "Speck-isms" — habits of speech the editor consistently adds. These are injected into personal-profile posts only, as habits rather than lines to copy.

Rules:
- Propose ONLY patterns supported by at least ${MIN_EVIDENCE} separate edits. One-off changes are not patterns.
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
        if (proposal?.text) alreadySeen.add(normalize(proposal.text));
      }
    }
    for (const word of [...bannedWords, ...speckIsms]) {
      alreadySeen.add(normalize(word));
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

Return a JSON array of proposals. Each object must have exactly these fields:
[
  {
    "type": "ban" or "speckism",
    "text": "...",
    "reason": "one sentence on what the edits show",
    "evidence_count": 2
  }
]

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
    const proposals = (Array.isArray(raw) ? raw : [])
      .filter(isProposal)
      .filter((p) => p.evidence_count >= MIN_EVIDENCE)
      .filter((p) => !alreadySeen.has(normalize(p.text)))
      .map((p) => ({ ...p, text: p.text.trim() }));

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
    const { runId, accepted } = await request.json();

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
      .select("id, banned_words, speck_isms")
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

    for (const proposal of chosen) {
      const text = proposal.text.trim();
      if (!text || existing.has(normalize(text))) continue;
      existing.add(normalize(text));
      if (proposal.type === "ban") {
        bannedWords.push(text);
      } else {
        speckIsms.push(text);
      }
    }

    const { error: updateError } = await supabase
      .from("app_settings")
      .update({
        banned_words: bannedWords.join("\n"),
        speck_isms: speckIsms.join("\n"),
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
