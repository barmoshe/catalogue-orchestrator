import { existsSync } from "node:fs";
import { createRequire } from "node:module";

/**
 * Resolve the ffmpeg / ffprobe binaries. Order:
 *   1. FFMPEG_PATH / FFPROBE_PATH env (set by Electron main to the asar.unpacked path,
 *      or by an operator wanting a system build with extra filters).
 *   2. The bundled ffmpeg-static / ffprobe-static binaries.
 * No system-ffmpeg assumption (AGENTS.md rule 3).
 */

// ffmpeg-static / ffprobe-static are CJS; resolve them via createRequire so they are
// never pulled into the Next client bundle (they're also in serverExternalPackages).
const req = createRequire(import.meta.url);

let _ffmpeg: string | null = null;
let _ffprobe: string | null = null;

export function ffmpegPath(): string {
  if (_ffmpeg) return _ffmpeg;
  const fromEnv = process.env.FFMPEG_PATH;
  if (fromEnv && existsSync(fromEnv)) return (_ffmpeg = fromEnv);
  const p = req("ffmpeg-static") as string | null;
  if (!p || !existsSync(p)) {
    throw new Error(
      "ffmpeg binary not found: set FFMPEG_PATH or install ffmpeg-static.",
    );
  }
  return (_ffmpeg = p);
}

export function ffprobePath(): string {
  if (_ffprobe) return _ffprobe;
  const fromEnv = process.env.FFPROBE_PATH;
  if (fromEnv && existsSync(fromEnv)) return (_ffprobe = fromEnv);
  const mod = req("ffprobe-static") as { path: string };
  const p = mod?.path;
  if (!p || !existsSync(p)) {
    throw new Error(
      "ffprobe binary not found: set FFPROBE_PATH or install ffprobe-static.",
    );
  }
  return (_ffprobe = p);
}
