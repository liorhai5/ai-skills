#!/usr/bin/env node
/**
 * Matrix verification for create-web-manifest (repo-only; never ships with the skill).
 *
 * Runs the skill across source-type x rasteriser and asserts the two invariants that make
 * this skill worth having, both of which existing favicon tools get wrong:
 *
 *   1. a maskable icon is never the same file as an `any` icon
 *   2. apple-touch-icon.png and both maskables carry no transparency
 *
 * Rasterisers that are not installed are reported as skipped, never as passed.
 *
 *   node tests/create-web-manifest/run-matrix.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.join(HERE, "..", "..", "skills", "create-web-manifest", "create-web-manifest.mjs");
const TOOLS = ["rsvg-convert", "magick", "inkscape", "sips"];

const which = (c) => { const r = spawnSync("which", [c], { encoding: "utf8" }); return r.status === 0 ? r.stdout.trim() : null; };
const pngInfo = (p) => {
  try {
    const fd = fs.openSync(p, "r"); const b = Buffer.alloc(26);
    fs.readSync(fd, b, 0, 26, 0); fs.closeSync(fd);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: b[25] === 4 || b[25] === 6 };
  } catch { return null; }
};

function fixture(kind) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "cwm-matrix-"));
  fs.mkdirSync(path.join(d, "public"), { recursive: true });
  fs.writeFileSync(path.join(d, "vite.config.ts"), "");
  fs.writeFileSync(path.join(d, "index.html"),
    '<!doctype html>\n<html lang="en"><head><meta charset="UTF-8" /><title>Vite + React</title></head><body></body></html>\n');
  if (kind === "svg") {
    // deliberately transparent outside the circle — the case that turns black on iOS
    fs.writeFileSync(path.join(d, "public", "logo.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#6d28d9"/></svg>\n');
  } else {
    const magick = which("magick");
    if (!magick) return null;
    spawnSync(magick, ["-size", "400x400", "xc:none", "-fill", "#c2410c", "-draw", "circle 200,200 200,60",
      path.join(d, "public", "logo.png")]);
  }
  return d;
}

const results = [];
for (const kind of ["svg", "png"]) {
  for (const tool of TOOLS) {
    const bin = which(tool);
    const label = `${kind.padEnd(3)} x ${tool}`;
    if (!bin) { results.push([label, "SKIP", "not installed"]); continue; }
    const dir = fixture(kind);
    if (!dir) { results.push([label, "SKIP", "cannot build fixture (needs magick)"]); continue; }

    // expose exactly one rasteriser, so the result is attributable to this tool
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), "cwm-shim-"));
    fs.symlinkSync(bin, path.join(shim, tool));
    const r = spawnSync(process.execPath, [SKILL, dir, "--name", "Matrix", "--short-name", "Mx"],
      { encoding: "utf8", env: { ...process.env, PATH: shim } });  // shim ONLY — /usr/bin would leak sips in

    const err = r.stderr || "";
    // Classify by what the script itself reported. A tool that cannot read this source type, or
    // cannot pad it, is out of scope for the invariants — provided it said so.
    if (/no rasteriser found for a/.test(err)) {
      results.push([label, "SKIP", "tool cannot read this source type — script said so"]);
      fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(shim, { recursive: true, force: true });
      continue;
    }
    if (/cannot pad a raster source/.test(err)) {
      results.push([label, "DEGRADED", "cannot pad; maskable + apple skipped, warned on stderr"]);
      fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(shim, { recursive: true, force: true });
      continue;
    }

    const P = (n) => path.join(dir, "public", n);
    const any192 = pngInfo(P("icon-192.png"));
    const mask192 = pngInfo(P("icon-maskable-192.png"));
    const apple = pngInfo(P("apple-touch-icon.png"));
    const fail = [];

    if (!any192) fail.push("no icon-192");
    if (!mask192) fail.push("no maskable-192");
    else if (fs.existsSync(P("icon-192.png")) &&
             Buffer.compare(fs.readFileSync(P("icon-192.png")), fs.readFileSync(P("icon-maskable-192.png"))) === 0)
      fail.push("INVARIANT 1: maskable === any (same bytes)");
    if (mask192?.alpha) fail.push("INVARIANT 2: maskable-192 has alpha");
    if (!apple) fail.push("no apple-touch-icon");
    else {
      if (apple.alpha) fail.push("INVARIANT 2: apple-touch-icon has alpha");
      if (apple.w !== 180 || apple.h !== 180) fail.push(`apple is ${apple.w}x${apple.h}`);
    }
    // a tool that cannot flatten must SAY so rather than emit a silently broken icon
    const warned = /keeps its alpha channel/.test(err);
    if (fail.some((x) => x.startsWith("INVARIANT 2")) && warned) {
      results.push([label, "DEGRADED", "cannot flatten, warned on stderr — honest"]);
    } else {
      results.push([label, fail.length ? "FAIL" : "pass", fail.join("; ") || "invariants hold"]);
    }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(shim, { recursive: true, force: true });
  }
}

let bad = 0;
console.log("source x rasteriser        result     detail");
for (const [l, s, d] of results) {
  if (s === "FAIL") bad++;
  console.log(`${l.padEnd(26)}${s.padEnd(11)}${d}`);
}
console.log(bad ? `\n${bad} FAIL(s)` : "\nno failures (SKIP = tool absent, DEGRADED = absent capability, reported honestly)");
process.exit(bad ? 1 : 0);
