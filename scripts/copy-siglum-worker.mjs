/**
 * Copies the @siglum/engine web worker into /public so the browser can load
 * it as a plain static file (`workerUrl: "/siglum/worker.js"`), which sidesteps
 * bundler-specific worker handling entirely.
 *
 * Runs on `predev` / `prebuild`. The worker must match the installed engine
 * version exactly (the hosted runtime descriptor is version-locked), so it is
 * copied from node_modules at build time rather than committed.
 *
 * One small patch is applied to the copy (never to node_modules): BibTeX warnings
 * must not abort the compile. BibTeX 4.03 exits non-zero even when it only warns
 * ("I didn't find a database entry for …", "empty journal in …"), and the engine
 * treats any non-zero exit as fatal — so a typo'd \cite key or an incomplete .bib
 * entry would produce no PDF at all. Overleaf (latexmk) instead produces the PDF
 * and shows `[?]`. We keep errors fatal and let warnings-only runs continue.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
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
let code = readFileSync(source, "utf8");

const FATAL_CHECK = "if (bib.exit_code !== 0) {";
const PATCHED_CHECK =
  // Fatal unless BibTeX reported only warnings (and no errors / unreadable files).
  "if (bib.exit_code !== 0 && !(/\\(There (?:was|were) \\d+ warnings?\\)/.test(bibLog) && !/error message|I couldn.t|I found no|---line|Fatal/.test(bibLog))) {";

let patched = false;
if (code.includes(FATAL_CHECK)) {
  code = code.replace(FATAL_CHECK, PATCHED_CHECK);
  patched = true;
}

writeFileSync(dest, code);
console.log(
  `[copy-siglum-worker] copied worker.js -> public/siglum/worker.js${patched ? " (BibTeX warnings made non-fatal)" : ""}`
);
if (!patched) {
  console.warn(
    "[copy-siglum-worker] BibTeX patch target not found — engine version changed? Compiles still work, " +
      "but a BibTeX *warning* (e.g. an undefined citation key) will abort the build instead of producing a PDF."
  );
}

// pdf.js worker, used in the browser to rasterise PDF figures for the Word export.
const pdfWorker = resolve(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
if (existsSync(pdfWorker)) {
  const pdfDir = resolve(root, "public/pdfjs");
  mkdirSync(pdfDir, { recursive: true });
  copyFileSync(pdfWorker, resolve(pdfDir, "pdf.worker.min.mjs"));
  console.log("[copy-siglum-worker] copied pdf.worker.min.mjs -> public/pdfjs/");
} else {
  console.warn("[copy-siglum-worker] pdfjs-dist worker not found — PDF figures can't be embedded in .docx.");
}
