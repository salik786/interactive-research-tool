import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (pdf.js under the hood) dynamically resolves a worker script
  // by a relative path at runtime; bundling it breaks that resolution
  // ("Setting up fake worker failed: Cannot find module '.../pdf.worker.mjs'").
  // Keeping it external means it's require()'d from node_modules as-is.
  serverExternalPackages: ["pdf-parse"],

  turbopack: {
    resolveAlias: {
      // @siglum/engine's optional BLAKE3 speed-up can't be bundled by
      // Turbopack (wasm ESM integration). Alias it to a stub that throws so
      // the engine falls back to its built-in hash. See the stub for details.
      "blake3-wasm/browser.js": "./src/lib/latex/blake3-disabled.ts",
    },
  },
};

export default nextConfig;
