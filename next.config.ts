import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (pdf.js under the hood) dynamically resolves a worker script
  // by a relative path at runtime; bundling it breaks that resolution
  // ("Setting up fake worker failed: Cannot find module '.../pdf.worker.mjs'").
  // Keeping it external means it's require()'d from node_modules as-is.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
