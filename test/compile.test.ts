import { describe, it, expect } from "vitest";
import { edlToFfmpeg, type ResolvedClip } from "../src/core/compile/edlToFfmpeg.js";
import { EDL, makeTarget } from "../src/core/schema/edl.js";
import { videoFitChain, escapeFilterPath } from "../src/core/compile/filters.js";
import { buildAss } from "../src/core/compile/captions.js";

function inputs(clips: ResolvedClip[], music = false) {
  const edl = EDL.parse({
    title: "t", mode: "assembly", target: makeTarget("9:16", { maxDurationSec: 30 }),
    music: music ? { assetId: "m", gainDb: -12, duckUnderSpeech: true } : null,
    clips: clips.map((c) => c.clip), rationale: "r",
  });
  return {
    edl, clips,
    music: music ? { path: "/m.mp3", gainDb: -12, duckUnderSpeech: true } : null,
    clipAssPath: (i: number) => (clips[i].clip.captions.length ? `/tmp/clip_${i}.ass` : null),
    fontsDir: "/fonts",
    segFile: (i: number) => `/tmp/seg_${i}.mp4`,
    concatListPath: "/tmp/concat.txt",
    preMusicFile: "/tmp/concat.mp4",
    outFile: "/tmp/out.mp4",
  };
}

const clip = (over = {}) => ({
  segmentId: "a:0", sourceIn: 1, sourceOut: 4, layout: "fit" as const,
  transitionIn: "cut" as const, transitionDurSec: 0, captions: [], speedMultiplier: 1, ...over,
});

describe("edlToFfmpeg (pure)", () => {
  it("emits one normalize job per clip + a concat job", () => {
    const rc: ResolvedClip[] = [
      { clip: clip(), path: "/a.mp4", kind: "video", hasAudio: true },
      { clip: clip({ segmentId: "b:0", layout: "fill" }), path: "/b.mp4", kind: "video", hasAudio: false },
    ];
    const plan = edlToFfmpeg(inputs(rc));
    expect(plan.segmentJobs.length).toBe(2);
    expect(plan.mixJob).toBeNull();
    expect(plan.concatJob.args.join(" ")).toContain("concat");
    // clip 0: trims with -ss/-t and maps source audio
    expect(plan.segmentJobs[0].args).toContain("-ss");
    expect(plan.segmentJobs[0].args.join(" ")).toContain("0:a");
    // clip 1: no audio → anullsrc added, maps 1:a
    expect(plan.segmentJobs[1].args.join(" ")).toContain("anullsrc");
    expect(plan.segmentJobs[1].args.join(" ")).toContain("crop=1080:1920");
  });

  it("loops a still image and adds silent audio", () => {
    const rc: ResolvedClip[] = [{ clip: clip({ segmentId: "img:0" }), path: "/i.png", kind: "image", hasAudio: false }];
    const plan = edlToFfmpeg(inputs(rc));
    const a = plan.segmentJobs[0].args.join(" ");
    expect(a).toContain("-loop 1");
    expect(a).toContain("anullsrc");
  });

  it("renders an audio-only segment over a color background", () => {
    const rc: ResolvedClip[] = [{ clip: clip({ segmentId: "aud:0" }), path: "/s.wav", kind: "audio", hasAudio: true }];
    const plan = edlToFfmpeg(inputs(rc));
    const a = plan.segmentJobs[0].args.join(" ");
    expect(a).toContain("color=c=");
    expect(a).toContain("1:a");
  });

  it("burns captions via libass when present", () => {
    const rc: ResolvedClip[] = [{ clip: clip({ captions: [{ text: "hello", startSec: 0, endSec: 2, style: "lower-third" }] }), path: "/a.mp4", kind: "video", hasAudio: true }];
    const plan = edlToFfmpeg(inputs(rc));
    expect(plan.segmentJobs[0].args.join(" ")).toContain("subtitles=filename=");
    expect(plan.segmentJobs[0].args.join(" ")).toContain("clip_0.ass");
  });

  it("adds a music mix job that ducks under speech", () => {
    const rc: ResolvedClip[] = [{ clip: clip(), path: "/a.mp4", kind: "video", hasAudio: true }];
    const plan = edlToFfmpeg(inputs(rc, true));
    expect(plan.mixJob).not.toBeNull();
    expect(plan.mixJob!.args.join(" ")).toContain("amix=inputs=2");
    expect(plan.mixJob!.args.join(" ")).toContain("sidechaincompress");
  });
});

describe("filters", () => {
  it("fit uses decrease+pad, fill uses increase+crop, blurpad overlays", () => {
    expect(videoFitChain("0:v", "fit", 1080, 1920, 30, "v")).toContain("force_original_aspect_ratio=decrease");
    expect(videoFitChain("0:v", "fill", 1080, 1920, 30, "v")).toContain("crop=1080:1920");
    expect(videoFitChain("0:v", "blurpad", 1080, 1920, 30, "v")).toContain("overlay=");
  });
  it("escapes filter-path metacharacters", () => {
    expect(escapeFilterPath("/a/b:c")).toBe("/a/b\\:c");
  });
  it("builds a valid ASS file with timed events", () => {
    const ass = buildAss([{ text: "hi", startSec: 0, endSec: 2.5, style: "lower-third" }], 1080, 1920);
    expect(ass).toContain("[V4+ Styles]");
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:02.50,Lower");
  });
});
