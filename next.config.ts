import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // `standalone` emits a self-contained server at .next/standalone/server.js that
  // Electron launches as a managed child in the packaged desktop app.
  output: "standalone",
  // Pin the tracing root to THIS project so standalone lands at
  // .next/standalone/server.js (not nested under a detected workspace root — there
  // are many sibling repos under the parent dir).
  outputFileTracingRoot: projectRoot,
  // ffmpeg-static / ffprobe-static ship platform binaries; never bundle them into the
  // server build. They are resolved from node_modules at runtime (and from
  // app.asar.unpacked when packaged inside Electron — see electron/main.cjs).
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
};

export default nextConfig;
