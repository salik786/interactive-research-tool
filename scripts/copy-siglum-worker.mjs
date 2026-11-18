/**
 * Copies the @siglum/engine web worker into /public so the browser can load
 * it as a plain static file (`workerUrl: "/siglum/worker.js"`), which sidesteps
 * bundler-specific worker handling entirely.
 *
 * Runs on `predev` / `prebuild`. The worker must match the installed engine
 * version exactly (the hosted runtime descriptor is version-locked), so it is
 * copied from node_modules at build time rather than committed.
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules/@siglum/engine/src/worker.js");
const destDir = resolve(root, "public/siglum");
const dest = resolve(destDir, "worker.js");

if (!existsSync(source)) {
  console.error(`[copy-siglum-worker] ${source} not found — run \`npm install\` first.`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(source, dest);
console.log("[copy-siglum-worker] copied worker.js -> public/siglum/worker.js");
