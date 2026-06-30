import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Next 16 ships flat ESLint configs directly (no FlatCompat needed). jsx-a11y rides
// along in core-web-vitals — the non-negotiable accessibility gate.
const eslintConfig = [
  // CommonJS Node files (Electron main/preload, build scripts) legitimately use require().
  { ignores: [".next/**", ".catalogue/**", "runtime/**", "node_modules/**", "**/*.cjs", "electron/**", "scripts/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Local-first app: keyframes + rendered frames are served by our own API routes;
    // next/image optimization doesn't apply, so plain <img> is intentional.
    rules: { "@next/next/no-img-element": "off" },
  },
];

export default eslintConfig;
