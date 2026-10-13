/** Every threshold and limit in one place. The similarity numbers are first guesses: tune them on real items. */
export const DIMENSIONS = 1536;

export const JOIN_THRESHOLD = 0.72; // an item joins a board at least this similar to it
export const TIGHT_THRESHOLD = 0.75; // a new board's members must average at least this
export const SPLIT_THRESHOLD = 0.6; // a board's two halves below this → suggest a split
export const MERGE_THRESHOLD = 0.9; // two boards at least this similar → suggest a merge

export const MAX_BOARDS_PER_ITEM = 3;
export const MIN_LOOSE_TO_GROW = 12;
export const MIN_BOARD_SIZE = 6;
export const MIN_SPLIT_BOARD = 12;

export const MAX_ATTEMPTS = 3;
export const STALE_CLAIM_MINUTES = 10;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_PX = 2000;
export const MIN_CROP_AREA = 0.2;

export const PALETTE = ["red", "orange", "yellow", "green", "blue", "purple", "pink", "brown", "beige", "black", "white", "grey", "silver", "gold"] as const;
export type PaletteColour = (typeof PALETTE)[number];
export const isPaletteColour = (s: string): s is PaletteColour => (PALETTE as readonly string[]).includes(s);

export function dailyCallCap(purpose: "pipeline" | "search"): number {
  const raw = purpose === "pipeline" ? process.env.GEMINI_DAILY_CALLS : process.env.SEARCH_DAILY_CALLS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : purpose === "pipeline" ? 500 : 300;
}
