// electron-forge config (CommonJS).
//
// Packaging discipline for this app's binary deps:
//   - ffmpeg-static / ffprobe-static ship platform binaries that CANNOT execute from
//     inside an asar archive. `asar.unpack` keeps them on disk as
//     app.asar.unpacked/...; electron/main.cjs rewrites the resolved paths accordingly.
//   - The Next `standalone` server + its static assets are unpacked too, so the
//     managed Node child can read them at runtime.
//
// NOTE: producing a signed .dmg is a heavier, confirmed step (needs the standalone
// asset-copy in scripts/prepare-standalone.cjs and Apple signing). The dev desktop
// runtime (`npm run dev` + `npm run electron:dev`) works without any of that.

const UNPACK_GLOB =
  "{**/node_modules/ffmpeg-static/**,**/node_modules/ffprobe-static/**,**/.next/standalone/**,**/.next/static/**}";

module.exports = {
  packagerConfig: {
    name: "catalogue-orchestrator",
    appBundleId: "com.barmoshe.catalogue-orchestrator",
    asar: {
      unpack: UNPACK_GLOB,
    },
    // Keep the package lean: dev tooling and generated state never ship.
    ignore: [
      /^\/\.catalogue/,
      /^\/runtime/,
      /^\/test/,
      /^\/cli/,
      /^\/\.git/,
      /\.map$/,
    ],
  },
  rebuildConfig: {},
  makers: [
    { name: "@electron-forge/maker-zip", platforms: ["darwin", "linux"] },
    { name: "@electron-forge/maker-dmg", config: {}, platforms: ["darwin"] },
  ],
};
