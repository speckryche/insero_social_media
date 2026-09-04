// The content skill file, read once at module load.
//
// This is the single voice definition for the whole app — Voice A for the
// company page, Voice B for Speck's profile. Batch generation and single-post
// regeneration both build their system prompt from it, so the two cannot drift
// the way they did while regeneration carried its own older copy.
//
// Server-only: this module touches `fs`. Never import it from a client
// component — import the plain-text pieces from "@/lib/prompts" instead.

import { readFileSync } from "fs";
import { join } from "path";

export const CONTENT_SKILL = readFileSync(
  join(process.cwd(), "src/lib/Insero_Content_Skill.md"),
  "utf-8"
);
