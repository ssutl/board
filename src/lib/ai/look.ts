import { z } from "zod";
import { isPaletteColour, PALETTE, type PaletteColour } from "@/lib/config";
import type { Box } from "@/lib/images/crop";

export type Tags = { what: string; colours: string[]; palette: PaletteColour[]; materials: string[]; era: string; mood: string[] };
export type Look = { box: Box | null; caption: string; tags: Tags };

// Over-long cosmetic fields are cut, not rejected: at temperature 0 a retry would return the same reply.
const cut = (max: number) => z.string().transform((v) => v.trim().slice(0, max).trim());
const words = (max: number) =>
  z
    .array(z.unknown())
    .default([])
    .transform((a) =>
      a
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().slice(0, 40).trim())
        .filter(Boolean)
        .slice(0, max),
    );

const LookSchema = z.object({
  box: z.array(z.number()).length(4).nullable().default(null),
  caption: cut(300).pipe(z.string().min(1)),
  what: cut(120).default(""),
  colours: words(8),
  palette: z.array(z.string()).default([]),
  materials: words(8),
  era: cut(40).default(""),
  mood: words(6),
});

export const LOOK_PROMPT = [
  "This image was saved to a personal moodboard of things I like (product design, cars, clothes, spaces, anything).",
  "1. If it is a screenshot with app or website interface around one main picture (headers, captions, buttons, likes), give the box of the main picture; otherwise box is null.",
  "2. Describe what it is in one caption sentence, specific (brand/model/style when you can tell).",
  `3. Tag it. palette uses only these words: ${PALETTE.join(", ")}.`,
  'Reply with JSON only: {"box": [ymin, xmin, ymax, xmax] on a 0-1000 scale or null, "caption": "...", "what": "...", "colours": ["descriptive colour names"], "palette": [...], "materials": [...], "era": "decade or period, or empty", "mood": ["2-4 words"]}.',
].join("\n");

/** Validates Gemini's reply. Throws on anything malformed, so the item fails and is retried. */
export function parseLook(text: string): Look {
  const r = LookSchema.parse(JSON.parse(text));
  const palette = [...new Set(r.palette.map((c) => c.trim().toLowerCase()))].filter(isPaletteColour);
  return {
    box: r.box as Box | null,
    caption: r.caption,
    tags: { what: r.what, colours: r.colours, palette, materials: r.materials, era: r.era, mood: r.mood },
  };
}
