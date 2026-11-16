// Bundles the scan worker into a single file with its dependencies, so the
// container needs only Node (no node_modules, no Next.js).
import { build } from "esbuild";

await build({
  entryPoints: ["src/worker/main.ts"],
  outfile: "dist/worker.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // "server-only" throws unless resolved with the react-server condition (as Next does).
  conditions: ["react-server"],
  sourcemap: true,
  // Some bundled CommonJS dependencies call require(); provide it in ESM output.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
