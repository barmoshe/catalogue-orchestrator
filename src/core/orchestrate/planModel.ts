import { EDL } from "../schema/edl";
import type { Intent } from "../schema/intent";
import type { ScoredSegment } from "../index/store";
import type { Providers } from "../providers/types";
import { validateEdl, type CatalogueLookup } from "./validate";

const MAX_ATTEMPTS = 3;

/**
 * The real orchestrator tier: Claude (or any LlmProvider) authors a schema-validated EDL
 * via forced structured output. We additionally run validateEdl (segment existence +
 * range) and, on failure, re-prompt with the precise error — never hand-fix the model
 * output (AGENTS rule 1). Returns a fully valid EDL or throws after MAX_ATTEMPTS.
 */
export async function planModel(
  candidates: ScoredSegment[],
  intent: Intent,
  lookup: CatalogueLookup,
  providers: Providers,
): Promise<EDL> {
  const system = systemPrompt(intent);
  const baseUser = userPrompt(candidates, intent, lookup);

  let lastError = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const user = lastError
      ? `${baseUser}\n\nYour previous attempt was rejected: ${lastError}\nFix it and return a corrected EDL.`
      : baseUser;
    const raw = await providers.llm.completeJson<EDL>({
      schema: EDL,
      schemaName: "edit_decision_list",
      schemaDescription: "A complete Edit Decision List the deterministic compiler will render.",
      system,
      user,
      maxTokens: 4096,
    });
    const res = validateEdl(raw, lookup);
    if (res.ok) return res.edl;
    lastError = res.error;
  }
  throw new Error(`planModel: model could not produce a valid EDL after ${MAX_ATTEMPTS} attempts (${lastError})`);
}

function systemPrompt(intent: Intent): string {
  return [
    "You are a video editor that outputs ONLY an Edit Decision List (EDL) — never ffmpeg, never prose.",
    "Hard rules:",
    "- Use ONLY segmentIds from the provided candidates. Never invent one.",
    "- For each clip, sourceIn/sourceOut must lie within that segment's source-asset duration (given per candidate).",
    "- Keep the total of (sourceOut - sourceIn) at or under the target maxDurationSec.",
    intent.mode === "highlights"
      ? "- Mode = highlights: pick the strongest self-contained moments, order them for a punchy short vertical clip, write a short caption per clip."
      : "- Mode = assembly: choose and order segments to fulfil the brief; add concise captions; pick a music bed only if one is offered.",
    "- Prefer layout 'fit' unless a clip clearly benefits from 'fill' or 'blurpad'.",
    "Return the EDL via the provided tool/schema.",
  ].join("\n");
}

function userPrompt(candidates: ScoredSegment[], intent: Intent, lookup: CatalogueLookup): string {
  const lines = candidates.map((c) => {
    const s = c.segment;
    const asset = lookup.asset(s.assetId);
    const dur = asset?.durationSec;
    return `- segmentId=${s.id} | asset=${asset?.kind ?? "?"} assetDurationSec=${dur ?? "still"} | window=${s.startSec.toFixed(2)}-${s.endSec.toFixed(2)}s | tags=[${s.tags.join(",")}] | salience=${s.salience.toFixed(2)} motion=${s.motion.toFixed(2)} speech=${s.speechRatio.toFixed(2)} | text=${JSON.stringify((s.caption ?? s.transcript ?? "").slice(0, 120))}`;
  });
  return [
    `Intent: mode=${intent.mode}, aspect=${intent.aspect}, maxDurationSec=${intent.maxDurationSec}, fps=${intent.fps}, wantMusic=${intent.wantMusic}`,
    intent.query ? `Brief/query: ${JSON.stringify(intent.query)}` : "Brief/query: (none — use the most salient moments)",
    intent.feedback ? `Refine feedback (revise the previous cut accordingly): ${JSON.stringify(intent.feedback)}` : "",
    "",
    `Candidates (${candidates.length}):`,
    ...lines,
  ].filter(Boolean).join("\n");
}
