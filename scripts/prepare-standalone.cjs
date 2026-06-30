// Copy the assets Next `standalone` output does NOT include by itself — `.next/static`
// and `public/` — into the standalone tree, so the packaged Electron child can serve
// them. Run after `next build`, before `electron-forge package/make`.
//
//   node scripts/prepare-standalone.cjs
//
// Idempotent: safe to re-run. No-op if there's no build yet.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(standalone)) {
  console.error("[prepare-standalone] no .next/standalone — run `next build` first.");
  process.exit(1);
}

const copies = [
  [path.join(root, ".next", "static"), path.join(standalone, ".next", "static")],
  [path.join(root, "public"), path.join(standalone, "public")],
];

for (const [src, dest] of copies) {
  if (!fs.existsSync(src)) continue;
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[prepare-standalone] copied ${path.relative(root, src)} -> ${path.relative(root, dest)}`);
}
console.log("[prepare-standalone] done.");
