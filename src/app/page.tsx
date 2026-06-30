export default function Home() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "64px 24px",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 34, marginBottom: 8 }}>catalogue-orchestrator</h1>
      <p style={{ color: "var(--co-muted)", marginTop: 0 }}>
        Local-first, domain-agnostic AI video orchestrator. A catalogue of media
        plus an intent becomes an AI-planned Edit Decision List, rendered to MP4
        by a deterministic ffmpeg compiler.
      </p>
      <p style={{ color: "var(--co-muted)" }}>
        Skeleton scaffolded (Phase 0). The catalogue browser, intent form, and
        refine loop arrive in Phase 5.
      </p>
    </main>
  );
}
