/**
 * Turbopack alias target for `blake3-wasm/browser.js` (see next.config.ts).
 *
 * @siglum/engine uses BLAKE3 only as an optional hashing speed-up and wraps
 * the load in try/catch, falling back to its built-in DJB2 hash. The real
 * package's browser build uses wasm ESM-integration imports that Turbopack
 * can't resolve, which fails the whole build. Throwing on evaluation makes the
 * engine's dynamic `import()` reject, which is exactly its supported fallback
 * path — so nothing is lost except a hashing speed-up on large documents.
 */
throw new Error("BLAKE3 is intentionally not bundled; using the engine's DJB2 fallback.");

export {};
