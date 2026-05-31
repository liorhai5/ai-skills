// Bundles src/cli.js + all runtime deps into scripts/md2html.mjs — a single,
// self-contained file the skill runs with `node`, no install step. Run: npm run build.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const version = JSON.parse(readFileSync(new URL("./package.json", import.meta.url))).version;

await build({
  entryPoints: ["src/cli.js"],
  outfile: "scripts/md2html.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  define: { __MD2HTML_VERSION__: JSON.stringify(version) },
  legalComments: "none",
});

console.log("built scripts/md2html.mjs");
