"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Segment = {
  id: string;
  assetId: string;
  startSec: number;
  endSec: number;
  caption: string | null;
  transcript: string | null;
  tags: string[];
  salience: number;
  keyframeUrl: string | null;
};
type Asset = { id: string; kind: string; durationSec: number | null; hasAudio: boolean; path?: string; segmentIds: string[] };
type Catalogue = { assets: Asset[]; segments: Segment[] };

type EdlClip = { segmentId: string; sourceIn: number; sourceOut: number; layout: string; captions: { text: string }[] };
type Edl = { title: string; mode: string; target: { aspect: string; width: number; height: number }; clips: EdlClip[]; rationale: string };
type Plan = { edl: Edl; planner: string; candidateCount: number };
type Job = { id: string; status: string; progress: number; stage: string; error: string | null; videoUrl: string | null; width: number | null; height: number | null; durationSec: number | null };

type Mode = "highlights" | "assembly";
type Aspect = "9:16" | "1:1" | "16:9";

export default function Studio() {
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [catErr, setCatErr] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("highlights");
  const [query, setQuery] = useState("");
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [maxDur, setMaxDur] = useState(15);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [job, setJob] = useState<Job | null>(null);
  const [feedback, setFeedback] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const segById = useCallback((id: string) => cat?.segments.find((s) => s.id === id), [cat]);

  useEffect(() => {
    fetch("/api/catalogue")
      .then((r) => r.json())
      .then((d) => (d.error ? setCatErr(d.error) : setCat(d)))
      .catch((e) => setCatErr(String(e)));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const doPlan = useCallback(async (fb?: string): Promise<Plan | null> => {
    setPlanning(true); setErr(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, query, aspect, maxDurationSec: maxDur, ...(fb ? { feedback: fb } : {}) }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || "plan failed"); return null; }
      setPlan(d); return d;
    } catch (e) { setErr(String(e)); return null; }
    finally { setPlanning(false); }
  }, [mode, query, aspect, maxDur]);

  const startRender = useCallback(async (edl: Edl) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setJob({ id: "", status: "queued", progress: 0, stage: "queued", error: null, videoUrl: null, width: null, height: null, durationSec: null });
    const res = await fetch("/api/render", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ edl }),
    });
    const d = await res.json();
    if (!res.ok) { setErr(d.error || "render failed"); setJob(null); return; }
    const id = d.jobId as string;
    pollRef.current = setInterval(async () => {
      const j: Job = await fetch(`/api/jobs/${id}`).then((r) => r.json());
      setJob(j);
      if (j.status === "completed" || j.status === "failed") { if (pollRef.current) clearInterval(pollRef.current); }
    }, 600);
  }, []);

  const onPlanAndRender = useCallback(async () => {
    const p = await doPlan();
    if (p) await startRender(p.edl);
  }, [doPlan, startRender]);

  const onRegenerate = useCallback(async () => {
    const p = await doPlan(feedback || "make it different");
    if (p) await startRender(p.edl);
  }, [doPlan, startRender, feedback]);

  return (
    <main className="co-studio">
      <header className="co-head">
        <div className="co-brand"><span className="co-glyph">CO</span> Catalogue Orchestrator <em>Studio</em></div>
        <a className="co-repo" href="https://barmoshe.github.io/catalogue-orchestrator/" target="_blank" rel="noopener">about ↗</a>
      </header>

      <div className="co-grid">
        {/* LEFT: catalogue browser */}
        <section className="co-panel">
          <h2>Catalogue</h2>
          {catErr && <p className="co-err">Failed to load: {catErr}</p>}
          {!cat && !catErr && <p className="co-muted">Loading… (run <code>co ingest</code> + <code>co index</code> if empty)</p>}
          {cat && cat.segments.length === 0 && <p className="co-muted">Empty. Ingest a media folder, then <code>co index</code>.</p>}
          {cat && (
            <>
              <p className="co-muted">{cat.assets.length} assets · {cat.segments.length} segments</p>
              <div className="co-tiles">
                {cat.segments.map((s) => (
                  <figure key={s.id} className="co-tile" title={s.caption ?? s.id}>
                    {s.keyframeUrl ? <img src={s.keyframeUrl} alt={s.caption ?? "segment"} loading="lazy" /> : <span className="co-noimg">{s.tags[0] ?? "seg"}</span>}
                    <figcaption>{(s.endSec - s.startSec).toFixed(1)}s · {s.tags.slice(0, 2).join(",")}</figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </section>

        {/* RIGHT: intent → plan → render */}
        <section className="co-panel">
          <h2>Make a cut</h2>
          <div className="co-form">
            <div className="co-row">
              <label>Mode</label>
              <div className="co-seg">
                <button className={mode === "highlights" ? "on" : ""} onClick={() => setMode("highlights")}>Highlights</button>
                <button className={mode === "assembly" ? "on" : ""} onClick={() => setMode("assembly")}>Assembly</button>
              </div>
            </div>
            <div className="co-row">
              <label>{mode === "highlights" ? "What to find" : "Brief"}</label>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={mode === "highlights" ? "e.g. the most energetic moments" : "e.g. a 15s promo of the city scenes"} />
            </div>
            <div className="co-row co-row--split">
              <div>
                <label>Aspect</label>
                <select value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)}>
                  <option value="9:16">9:16</option><option value="1:1">1:1</option><option value="16:9">16:9</option>
                </select>
              </div>
              <div>
                <label>Max seconds</label>
                <input type="number" min={3} max={120} value={maxDur} onChange={(e) => setMaxDur(Number(e.target.value))} />
              </div>
            </div>
            <button className="co-cta" disabled={planning} onClick={onPlanAndRender}>
              {planning ? "Planning…" : "Plan + Render"}
            </button>
            {err && <p className="co-err">{err}</p>}
          </div>

          {plan && (
            <div className="co-plan">
              <h3>EDL <span className="co-muted">· {plan.planner} · {plan.candidateCount} candidates · {plan.edl.clips.length} clips · {plan.edl.target.aspect}</span></h3>
              <p className="co-rationale">{plan.edl.rationale}</p>
              <div className="co-timeline">
                {plan.edl.clips.map((c, i) => {
                  const seg = segById(c.segmentId);
                  return (
                    <div key={i} className="co-clip" title={`${c.segmentId}\n${c.sourceIn.toFixed(1)}–${c.sourceOut.toFixed(1)}s · ${c.layout}`}>
                      {seg?.keyframeUrl ? <img src={seg.keyframeUrl} alt="" /> : <span className="co-noimg">{i + 1}</span>}
                      <span className="co-cliplen">{(c.sourceOut - c.sourceIn).toFixed(1)}s</span>
                      {c.captions.length > 0 && <span className="co-cc">CC</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {job && (
            <div className="co-render">
              {job.status !== "completed" && job.status !== "failed" && (
                <div className="co-prog"><div className="co-prog__bar" style={{ width: `${Math.round(job.progress * 100)}%` }} /><span>{job.stage} · {Math.round(job.progress * 100)}%</span></div>
              )}
              {job.status === "failed" && <p className="co-err">Render failed: {job.error}</p>}
              {job.status === "completed" && job.videoUrl && (
                <>
                  <video className="co-video" src={job.videoUrl} controls autoPlay loop />
                  <p className="co-muted">{job.width}×{job.height} · {(job.durationSec ?? 0).toFixed(1)}s</p>
                  <div className="co-refine">
                    <input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Refine: e.g. shorter, more energetic, drop clip 2" />
                    <button className="co-cta co-cta--ghost" disabled={planning} onClick={onRegenerate}>Regenerate</button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
