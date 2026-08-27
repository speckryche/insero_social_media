# Image system — decisions and findings

Supplements `CC-PROMPT-image-system-rebuild.md` (the 12-step build prompt).

## Direction (locked Aug 2026)

- **Company page** — a generated stylized-3D scene of a real business place
  in brand green, with the INZO mascot composited in from a transparent PNG,
  and one auto-fitting headline drawn on canvas. New scene every post.
- **Personal profile** — photoreal, warm 35mm, no mascot, no text. Must also
  accept a photo Speck uploads himself, or no image at all.
- The old 14-template canvas system and all 8 Canva backgrounds are deleted.
- INZO is **composited, never generated** — zero character drift, zero cost.

## Finding: prompt-only style locking does not work

Tested a hardened prompt spine ("stylized Pixar-style render, chunky rounded
geometry, matte clay-like surfaces, NOT photography") across three subjects.

**Result:** style consistency was perfect. Everything else broke.

- A human figure appeared in **all three** frames despite "no people, no
  characters" stated three times
- Subjects became unrecognisable — a rooftop antenna rendered as a green blob
- Fake signage text appeared ("P.ONT")
- Output was far too dark and desaturated

The looser spine ("Soft 3D cartoon render in the style of a modern animated
film") produces legible subjects but inconsistent style. There is no prompt
that gives both.

## Consequence for the build

**Stop trying to make generation deterministic. Make regeneration cheap.**

Social Hub already has an approval workflow — that is the right place for
this. Two additions to the build prompt:

1. **Reroll must be one click.** The post approval view needs a prominent
   "new scene" control hitting `regenerate-image?newScene=true`. At 0.12
   credits a scene, rerolling three times to get a good one costs under
   half a cent. Nothing should feel precious.
2. **Flag suspect scenes at generation time.** After a scene returns, run a
   cheap check for a detected face or high-contrast text-like regions and
   mark the post for review rather than silently shipping it. A flagged post
   still renders — it just sorts to the top of the approval queue.

Everything else in the build prompt stands unchanged.

## Still open

- Higgsfield API credentials (`HIGGSFIELD_API_KEY_ID` / `_SECRET`) from
  cloud.higgsfield.ai — confirm whether they draw on the Plus balance or a
  separate pay-as-you-go pool
- Migration 022 written but not applied
- INZO pose registry needs each pose's ground line measured, not guessed
