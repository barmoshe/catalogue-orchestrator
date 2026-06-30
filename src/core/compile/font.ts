import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

const CANDIDATES = [
  // bundled with the repo (preferred — reproducible)
  join(repoRoot, "assets", "fonts", "caption.ttf"),
  // common system fonts (dev fallback)
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
  "/Library/Fonts/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
];

/**
 * Resolve a caption font for drawtext. Order: CAPTION_FONT env → bundled repo font →
 * a known system font. Captions are skipped (not fatal) if none is found.
 */
export function resolveFont(env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = env.CAPTION_FONT;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const c of CANDIDATES) if (existsSync(c)) return c;
  return null;
}
