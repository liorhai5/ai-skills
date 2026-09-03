#!/usr/bin/env node
/**
 * create-web-manifest — generate a web app's complete install identity.
 *
 * Node >= 18, built-ins only. Rasterising is the ONLY step delegated to an
 * external tool; manifest, <head>, SVG derivatives, .ico assembly and the
 * verify pass are all deterministic here and run with no dependencies.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OUT = [];
const NOTES = [];
const out = (m = "") => OUT.push(m);
const warn = (m) => process.stderr.write(`warn: ${m}\n`);
const hint = (m) => process.stderr.write(`hint: ${m}\n`);

// ────────────────────────────────────────────────────────── args

const BOOL = new Set(["dry-run", "verify-only", "og", "help", "no-head", "force"]);

function parseArgs(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("--")) {
      const eq = t.indexOf("=");
      const k = eq === -1 ? t.slice(2) : t.slice(2, eq);
      if (eq !== -1) flags[k] = t.slice(eq + 1);
      else if (BOOL.has(k)) flags[k] = true;
      else flags[k] = argv[++i];
    } else pos.push(t);
  }
  return { pos, flags };
}

const HELP = `create-web-manifest <project-dir> [source-image] [options]

  --source <path>        Source mark (.svg strongly preferred, or .png)
  --name <str>           Full app name          --short-name <str>   <= 12 chars
  --description <str>    App description        --categories a,b
  --theme-color <hex>    Browser/UI chrome      --bg-color <hex>     Splash background
  --start-url <url>      Default "/"            --scope <url>        Default "/"
  --display <mode>       Default "standalone"   --orientation <mode>
  --id <str>             Stable identity, default = start-url
  --lang <code>          Default "en"           --site-url <url>     For canonical + og:url
  --og                   Also render a 1200x630 og-image.png
  --no-head              Write assets + manifest, leave HTML untouched
  --dry-run              Print the plan, write nothing
  --verify-only          Audit what is already on disk, change nothing
  --force                Proceed even when the verify pre-check objects
`;

// ─────────────────────────────────────────────────── tiny helpers

const ex = (...p) => fs.existsSync(path.join(...p));
const readIf = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
const listIf = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
const titleCase = (s) => s.replace(/[-_./]+/g, " ").replace(/\s+/g, " ").trim()
  .replace(/\b\w/g, (c) => c.toUpperCase());

function probe(cmd, args) {
  try { return spawnSync(cmd, args, { stdio: "ignore", timeout: 20000 }).status === 0; }
  catch { return false; }
}
function sh(cmd, args) {
  return spawnSync(cmd, args, { stdio: "pipe", timeout: 180000, encoding: "utf8" });
}
function isHex(c) { return typeof c === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c); }
function norm6(c) {
  if (!isHex(c)) return null;
  const h = c.slice(1);
  return "#" + (h.length === 3 ? h.split("").map((x) => x + x).join("") : h).toLowerCase();
}

/** Bounded recursive walk — never descends into build or vendor trees. */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".svelte-kit",
  "out", "coverage", "target", "vendor", ".venv", "__pycache__", ".cache", "src-tauri"]);
function walk(dir, { exts, max = 400, depth = 6 }) {
  const hits = [];
  (function rec(d, lvl) {
    if (lvl > depth || hits.length >= max) return;
    for (const e of listIf(d)) {
      if (hits.length >= max) return;
      const p = path.join(d, e);
      let st; try { st = fs.statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (!SKIP_DIRS.has(e) && !e.startsWith(".")) rec(p, lvl + 1); }
      else if (exts.some((x) => e.toLowerCase().endsWith(x))) hits.push(p);
    }
  })(dir, 0);
  return hits;
}

// ────────────────────────────────────────── project + static dir

const FRAMEWORKS = [
  { id: "next",      dir: "public",     hint: "app/layout.tsx metadata", test: (d) => re(d, /^next\.config\./) },
  { id: "nuxt",      dir: "public",     hint: "nuxt.config app.head",    test: (d) => re(d, /^nuxt\.config\./) },
  { id: "astro",     dir: "public",     hint: "src/layouts/*.astro",     test: (d) => re(d, /^astro\.config\./) },
  { id: "sveltekit", dir: "static",     hint: "src/app.html",            test: (d) => re(d, /^svelte\.config\./) },
  { id: "gatsby",    dir: "static",     hint: "gatsby-ssr.js",           test: (d) => re(d, /^gatsby-config\./) },
  { id: "angular",   dir: "src/assets", hint: "src/index.html",          test: (d) => ex(d, "angular.json") },
  { id: "vue-cli",   dir: "public",     hint: "public/index.html",       test: (d) => re(d, /^vue\.config\./) },
  { id: "hugo",      dir: "static",     hint: "layouts/partials/head",   test: (d) => ex(d, "hugo.toml") || ex(d, "hugo.yaml") },
  { id: "jekyll",    dir: ".",          hint: "_includes/head.html",     test: (d) => ex(d, "_config.yml") },
  { id: "eleventy",  dir: "public",     hint: "_includes layout",        test: (d) => ex(d, ".eleventy.js") || re(d, /^eleventy\.config\./) },
  { id: "cra",       dir: "public",     hint: "public/index.html",       test: (d) => dep(d, "react-scripts") },
  { id: "vite",      dir: "public",     hint: "index.html",              test: (d) => re(d, /^vite\.config\./) },
  { id: "static",    dir: ".",          hint: "index.html",              test: (d) => ex(d, "index.html") },
];
const re = (d, rx) => listIf(d).some((f) => rx.test(f));
const dep = (d, name) => {
  const pkg = pkgJson(d);
  return !!pkg && !!({ ...pkg.dependencies, ...pkg.devDependencies }[name]);
};
function pkgJson(d) {
  const raw = readIf(path.join(d, "package.json"));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Icons already on disk outrank framework convention — that is where the app already looks. */
const ANCHORS = ["favicon.ico", "apple-touch-icon.png", "site.webmanifest",
  "manifest.webmanifest", "manifest.json", "favicon.svg"];

function detectProject(root) {
  const fw = FRAMEWORKS.find((f) => f.test(root)) || { id: "unknown", dir: ".", hint: "?" };
  let staticDir = path.join(root, fw.dir);
  let via = `${fw.id} convention`;

  for (const cand of [fw.dir, ".", "public", "static", "src/assets", "assets", "www"]) {
    const abs = path.join(root, cand);
    const found = ANCHORS.filter((a) => ex(abs, a));
    // manifest.json alone is ambiguous (sounds/manifest.json, extension manifests…)
    const strong = found.filter((f) => f !== "manifest.json");
    if (strong.length) { staticDir = abs; via = `existing ${strong.join(", ")}`; break; }
  }

  const htmlCandidates = ["index.html", "public/index.html", "src/index.html", "app/index.html"]
    .map((p) => path.join(root, p)).filter(fs.existsSync);

  return { framework: fw.id, headHint: fw.hint, staticDir, staticVia: via, html: htmlCandidates[0] || null };
}

// ─────────────────────────────────────────────── identity gather

const SCAFFOLD_TITLES = [
  /^vite \+/i, /^tauri \+/i, /^react app$/i, /^create react app/i, /^document$/i,
  /^untitled/i, /^my app$/i, /^next\.?js app$/i, /^svelte ?kit?/i, /^vue app$/i,
  /^astro$/i, /^home$/i, /^app$/i, /^index$/i, /^webpack app$/i, /^title$/i,
];
const isScaffold = (t) => !t || SCAFFOLD_TITLES.some((rx) => rx.test(t.trim()));

function findManifest(staticDir) {
  for (const n of ["site.webmanifest", "manifest.webmanifest", "manifest.json"]) {
    const p = path.join(staticDir, n);
    const raw = readIf(p);
    if (!raw) continue;
    try {
      const j = JSON.parse(raw);
      // a sounds/asset manifest is not a web app manifest
      if (j && (j.name || j.short_name || j.icons || j.start_url)) return { path: p, json: j, name: n };
    } catch { /* not ours */ }
  }
  return null;
}

function gatherIdentity(root, proj) {
  const pkg = pkgJson(root) || {};
  const html = proj.html ? readIf(proj.html) : null;
  const existing = findManifest(proj.staticDir);
  const g = (rx, s) => { const m = s && s.match(rx); return m ? m[1].trim() : null; };

  const title = html ? g(/<title[^>]*>([\s\S]*?)<\/title>/i, html) : null;
  const metaDesc = html ? g(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i, html) : null;
  const metaTheme = html ? g(/<meta\s+name=["']theme-color["'][^>]*content=["']([^"']*)["']/i, html) : null;

  return {
    pkg, html, htmlPath: proj.html, existing,
    title, titleIsScaffold: isScaffold(title),
    description: (existing?.json.description) || metaDesc || pkg.description || null,
    name: (existing?.json.name) || (!isScaffold(title) ? title : null) || (pkg.name ? titleCase(pkg.name) : null)
          || titleCase(path.basename(root)),
    shortName: (existing?.json.short_name) || null,
    themeColor: norm6(existing?.json.theme_color) || norm6(metaTheme) || null,
    bgColor: norm6(existing?.json.background_color) || null,
  };
}

// ────────────────────────────────────────────── colour sampling

const NEAR_NEUTRAL = (h) => {
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return Math.max(r, g, b) - Math.min(r, g, b) < 24;
};

/** Rank brand-ish colours out of the project's own stylesheets. Suggestions only — the agent picks. */
function sampleColors(root, sourceSvgText) {
  const files = walk(root, { exts: [".css", ".scss", ".sass", ".less"], max: 120 });
  const score = new Map();
  const bump = (hex, n, why) => {
    const h = norm6(hex); if (!h) return;
    const cur = score.get(h) || { n: 0, why: new Set() };
    cur.n += n; cur.why.add(why); score.set(h, cur);
  };
  const BRANDY = /(--[\w-]*(?:brand|primary|accent|theme|main|action|highlight)[\w-]*)\s*:\s*(#[0-9a-f]{3,6})/gi;
  const SURFACE = /(--[\w-]*(?:bg|background|surface|canvas|paper)[\w-]*)\s*:\s*(#[0-9a-f]{3,6})/gi;
  const ANY = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi;

  for (const f of files) {
    const s = readIf(f); if (!s) continue;
    for (const m of s.matchAll(BRANDY)) bump(m[2], 40, `${m[1]} custom property`);
    for (const m of s.matchAll(SURFACE)) bump(m[2], 12, `${m[1]} custom property`);
    for (const m of s.matchAll(ANY)) bump(m[0], 1, "used in CSS");
  }
  // colours inside the mark itself are the strongest brand signal there is
  if (sourceSvgText) for (const m of sourceSvgText.matchAll(ANY)) bump(m[0], 60, "used in the source mark");

  const ranked = [...score.entries()]
    .map(([hex, v]) => ({ hex, n: v.n, why: [...v.why].join(", ") }))
    .sort((a, b) => b.n - a.n);

  return {
    theme: ranked.find((c) => !NEAR_NEUTRAL(c.hex)) || ranked[0] || null,
    background: ranked.find((c) => NEAR_NEUTRAL(c.hex)) || null,
    ranked: ranked.slice(0, 8),
  };
}

// ──────────────────────────────────────────── SVG derivative synthesis
//
// A maskable icon must survive Android cropping its outer ~20%: the mark is
// nested at 80% inside a filled square. A nested <svg> element carries its own
// viewport, so the original content scales without us reinterpreting its paths.

function parseSvg(text) {
  const openM = text.match(/<svg\b[^>]*>/i);
  if (!openM) return null;
  const open = openM[0];
  const inner = text.slice(openM.index + open.length, text.lastIndexOf("</svg>"));
  const attr = (n) => { const m = open.match(new RegExp(`\\b${n}\\s*=\\s*["']([^"']+)["']`, "i")); return m ? m[1] : null; };
  let viewBox = attr("viewBox");
  if (!viewBox) {
    const w = parseFloat(attr("width")), h = parseFloat(attr("height"));
    viewBox = Number.isFinite(w) && Number.isFinite(h) ? `0 0 ${w} ${h}` : "0 0 100 100";
  }
  // <defs>/ids survive because each derivative nests the source exactly once
  return { inner, viewBox };
}

function deriveSvg(src, { size = 512, pad = 0, bg = null }) {
  const s = parseSvg(src);
  if (!s) return null;
  const inset = Math.round(size * pad * 1000) / 1000;
  const box = size - inset * 2;
  const rect = bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${rect}
<svg x="${inset}" y="${inset}" width="${box}" height="${box}" viewBox="${s.viewBox}" preserveAspectRatio="xMidYMid meet">
${s.inner}
</svg>
</svg>
`;
}

// ─────────────────────────────────────────────────── PNG + ICO (pure)

/** Read real dimensions and colour type straight out of the IHDR chunk. */
function pngInfo(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const b = Buffer.alloc(26);
    if (fs.readSync(fd, b, 0, 26, 0) < 26) return null;
    if (b.readUInt32BE(0) !== 0x89504e47) return null;
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}
const HAS_ALPHA = (ct) => ct === 4 || ct === 6;

/** Assemble a multi-resolution .ico. PNG-compressed entries; every current browser reads them. */
function buildIco(pngPaths) {
  const imgs = pngPaths.map((p) => {
    const data = fs.readFileSync(p);
    const info = pngInfo(p);
    if (!info) throw new Error(`not a PNG: ${p}`);
    return { data, w: info.width, h: info.height };
  });
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
  const dir = Buffer.alloc(16 * imgs.length);
  let offset = 6 + dir.length;
  imgs.forEach((im, i) => {
    const o = i * 16;
    dir[o] = im.w >= 256 ? 0 : im.w;
    dir[o + 1] = im.h >= 256 ? 0 : im.h;
    dir[o + 2] = 0; dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(im.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += im.data.length;
  });
  return Buffer.concat([head, dir, ...imgs.map((i) => i.data)]);
}

// ────────────────────────────────────────────────── rasterisers
//
// The one capability we cannot do with built-ins. First match wins; nothing is
// ever installed silently — a miss prints the exact command to fix it.

const RASTERIZERS = [
  {
    name: "rsvg-convert", svg: true, raster: false, pad: false,
    detect: () => probe("rsvg-convert", ["--version"]),
    run: (src, dst, size) => sh("rsvg-convert", ["-w", String(size), "-h", String(size), "-o", dst, src]),
    runFlat: (src, dst, size, bg) => sh("rsvg-convert", ["-w", String(size), "-h", String(size),
      "-b", bg || "#ffffff", "-o", dst, src]),
    runWH: (src, dst, w, h) => sh("rsvg-convert", ["-w", String(w), "-h", String(h), "-o", dst, src]),
    install: "brew install librsvg",
  },
  {
    name: "magick", svg: true, raster: true, pad: true,
    detect: () => probe("magick", ["-version"]),
    run: (src, dst, size) => sh("magick", ["-background", "none", src, "-resize", `${size}x${size}`, "-alpha", "on", dst]),
    runWH: (src, dst, w, h) => sh("magick", ["-background", "none", src, "-resize", `${w}x${h}!`, dst]),
    runFlat: (src, dst, size, bg) => sh("magick", ["-background", bg || "#ffffff", src,
      "-resize", `${size}x${size}`, "-flatten", "-alpha", "off", dst]),
    // -alpha remove composites whatever is left against -background; -alpha off drops the
    // channel. Without both, a transparent source survives into apple-touch-icon.png and
    // iOS paints those pixels black.
    runPad: (src, dst, size, pad, bg) => {
      const inner = Math.max(1, Math.round(size * (1 - pad * 2)));
      return sh("magick", ["-background", bg || "#ffffff", src, "-resize", `${inner}x${inner}`,
        "-gravity", "center", "-extent", `${size}x${size}`, "-alpha", "remove", "-alpha", "off", dst]);
    },
    install: "brew install imagemagick",
  },
  {
    name: "inkscape", svg: true, raster: false, pad: false,
    detect: () => probe("inkscape", ["--version"]),
    run: (src, dst, size) => sh("inkscape", [src, "--export-type=png", `--export-width=${size}`,
      `--export-height=${size}`, `--export-filename=${dst}`]),
    runWH: (src, dst, w, h) => sh("inkscape", [src, "--export-type=png", `--export-width=${w}`,
      `--export-height=${h}`, `--export-filename=${dst}`]),
    runFlat: (src, dst, size, bg) => sh("inkscape", [src, "--export-type=png", `--export-width=${size}`,
      `--export-height=${size}`, `--export-background=${bg || "#ffffff"}`,
      "--export-background-opacity=1", `--export-filename=${dst}`]),
    install: "brew install --cask inkscape",
  },
  {
    name: "sharp-cli (npx cache)", svg: true, raster: true, pad: false,
    detect: () => probe("npx", ["--no-install", "sharp", "--version"]),
    run: (src, dst, size) => sh("npx", ["--no-install", "sharp", "-i", src, "-o", dst,
      "resize", String(size), String(size)]),
    runWH: (src, dst, w, h) => sh("npx", ["--no-install", "sharp", "-i", src, "-o", dst,
      "resize", String(w), String(h)]),
    install: "npm i -g sharp-cli",
  },
  {
    name: "sips", svg: false, raster: true, pad: false,
    detect: () => process.platform === "darwin" && probe("sips", ["--version"]),
    run: (src, dst, size) => sh("sips", ["-z", String(size), String(size), src, "--out", dst]),
    runWH: (src, dst, w, h) => sh("sips", ["-z", String(h), String(w), src, "--out", dst]),
    install: "(built into macOS)",
  },
];

function pickRasterizer(sourceIsSvg) {
  const usable = RASTERIZERS.filter((r) => (sourceIsSvg ? r.svg : r.raster) && r.detect());
  return { chosen: usable[0] || null, all: usable };
}

// ────────────────────────────────────────────────── manifest + head

const ASSETS = {
  svg: "favicon.svg", ico: "favicon.ico", png96: "favicon-96x96.png",
  apple: "apple-touch-icon.png", any192: "icon-192.png", any512: "icon-512.png",
  mask192: "icon-maskable-192.png", mask512: "icon-maskable-512.png", og: "og-image.png",
};

function buildManifest(plan, present) {
  const icons = [];
  const add = (file, size, purpose) => {
    if (present.has(file)) icons.push({ src: plan.href(file), sizes: `${size}x${size}`, type: "image/png", purpose });
  };
  add(ASSETS.any192, 192, "any");
  add(ASSETS.any512, 512, "any");
  // separate files — an unpadded icon declared maskable gets its edges cropped away
  add(ASSETS.mask192, 192, "maskable");
  add(ASSETS.mask512, 512, "maskable");
  if (present.has(ASSETS.svg)) icons.push({ src: plan.href(ASSETS.svg), sizes: "any", type: "image/svg+xml", purpose: "any" });

  const m = {
    id: plan.id,
    name: plan.name,
    short_name: plan.shortName,
    description: plan.description,
    lang: plan.lang,
    dir: "ltr",
    start_url: plan.startUrl,
    scope: plan.scope,
    display: plan.display,
    display_override: [plan.display, "standalone", "browser"].filter((v, i, a) => a.indexOf(v) === i),
    orientation: plan.orientation,
    theme_color: plan.themeColor,
    background_color: plan.bgColor,
    icons,
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    prefer_related_applications: false,
  };
  if (plan.categories.length) m.categories = plan.categories;
  // screenshots unlock Chrome's rich install dialog; only claimed when the files exist
  if (plan.screenshots.length) m.screenshots = plan.screenshots;
  for (const k of Object.keys(m)) if (m[k] === null || m[k] === undefined) delete m[k];
  return m;
}

const START = "<!-- create-web-manifest:start -->";
const END = "<!-- create-web-manifest:end -->";

function buildHead(plan, present, manifestName) {
  const L = [];
  // Only tags this block actually re-emits may be stripped from the document. Anything else the
  // author wrote — og:locale, twitter:site, article:*, a hand-set canonical — is left in place.
  const managed = { names: new Set(), props: new Set(), rels: new Set() };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const h = (f) => plan.href(f);
  const meta = (n, attrs) => { managed.names.add(n); L.push(`<meta name="${n}" ${attrs} />`); };
  const prop = (p, content) => { managed.props.add(p); L.push(`<meta property="${p}" content="${esc(content)}" />`); };
  const link = (rel, attrs) => { managed.rels.add(rel); L.push(`<link rel="${rel}" ${attrs} />`); };

  L.push(START);
  L.push(`<title>${esc(plan.name)}</title>`);
  if (plan.description) meta("description", `content="${esc(plan.description)}"`);
  if (present.has(ASSETS.ico)) link("icon", `href="${h(ASSETS.ico)}" sizes="48x48"`);
  if (present.has(ASSETS.svg)) link("icon", `href="${h(ASSETS.svg)}" type="image/svg+xml"`);
  if (present.has(ASSETS.png96)) link("icon", `type="image/png" sizes="96x96" href="${h(ASSETS.png96)}"`);
  if (present.has(ASSETS.apple)) link("apple-touch-icon", `sizes="180x180" href="${h(ASSETS.apple)}"`);
  link("manifest", `href="${plan.href(manifestName)}"`);
  meta("theme-color", `content="${plan.themeColor}" media="(prefers-color-scheme: light)"`);
  meta("theme-color", `content="${plan.themeColorDark}" media="(prefers-color-scheme: dark)"`);
  meta("mobile-web-app-capable", `content="yes"`);
  meta("apple-mobile-web-app-capable", `content="yes"`);
  meta("apple-mobile-web-app-status-bar-style", `content="black-translucent"`);
  meta("apple-mobile-web-app-title", `content="${esc(plan.shortName)}"`);
  meta("application-name", `content="${esc(plan.shortName)}"`);
  // canonical is claimed only when we can emit a real absolute URL; otherwise the author's
  // own canonical must survive untouched
  if (plan.siteUrl) link("canonical", `href="${esc(plan.siteUrl)}"`);

  // link previews — the other half of "displayed nicely"
  prop("og:type", "website");
  prop("og:site_name", plan.name);
  prop("og:title", plan.name);
  if (plan.description) prop("og:description", plan.description);
  if (plan.siteUrl) prop("og:url", plan.siteUrl);
  const ogImg = present.has(ASSETS.og) ? ASSETS.og : (present.has(ASSETS.any512) ? ASSETS.any512 : null);
  if (ogImg) {
    const abs = plan.siteUrl ? plan.siteUrl.replace(/\/$/, "") + h(ogImg) : h(ogImg);
    prop("og:image", abs);
    meta("twitter:card", `content="${ogImg === ASSETS.og ? "summary_large_image" : "summary"}"`);
    meta("twitter:image", `content="${esc(abs)}"`);
  }
  meta("twitter:title", `content="${esc(plan.name)}"`);
  if (plan.description) meta("twitter:description", `content="${esc(plan.description)}"`);
  L.push(END);
  return { block: L.map((l) => `    ${l}`).join("\n"), managed };
}

const RX_ESC = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Regexes for the tags this run will re-emit, and nothing else. The icon rels are the one
 * deliberate over-reach: the whole icon set is replaced, so stale precomposed/shortcut
 * variants go with it. A tag the author wrote that we do not re-emit is never touched.
 */
function supersededBy(managed) {
  const rx = [/^[ \t]*<title\b[\s\S]*?<\/title>[ \t]*\r?\n?/gim];
  const alt = (set) => [...set].map(RX_ESC).join("|");
  if (managed.names.size) rx.push(new RegExp(`^[ \\t]*<meta\\s+name=["'](?:${alt(managed.names)})["'][^>]*>[ \\t]*\\r?\\n?`, "gim"));
  if (managed.props.size) rx.push(new RegExp(`^[ \\t]*<meta\\s+property=["'](?:${alt(managed.props)})["'][^>]*>[ \\t]*\\r?\\n?`, "gim"));
  const rels = new Set([...managed.rels, "shortcut icon", "apple-touch-icon-precomposed"]);
  rx.push(new RegExp(`^[ \\t]*<link\\s+[^>]*rel=["'](?:${alt(rels)})["'][^>]*>[ \\t]*\\r?\\n?`, "gim"));
  return rx;
}

function injectHead(html, block, managed) {
  const s = html.indexOf(START), e = html.indexOf(END);
  if (s !== -1 && e !== -1) {
    const lineStart = html.lastIndexOf("\n", s) + 1;
    return { html: html.slice(0, lineStart) + block.replace(/^\s+/, "    ") + html.slice(e + END.length), removed: ["(previous block)"] };
  }
  const removed = [];
  let body = html;
  for (const rx of supersededBy(managed)) {
    body = body.replace(rx, (m) => { removed.push(m.trim()); return ""; });
  }
  // strictly in priority order — an alternation would match whichever came first in the
  // document and could push <meta charset> out of the first 1024 bytes
  let anchor = null;
  for (const rx of [/<meta\s+name=["']viewport["'][^>]*>/i, /<meta\s+charset[^>]*>/i, /<head[^>]*>/i]) {
    anchor = body.match(rx); if (anchor) break;
  }
  if (!anchor) return { html: body, removed, failed: true };
  const at = anchor.index + anchor[0].length;
  return { html: body.slice(0, at) + "\n" + block + body.slice(at), removed };
}

// ────────────────────────────────────────────────────────── verify
//
// Everything is re-read from disk. This is the pass that catches the mistakes
// hand-written manifests make: icons that 404, sizes that lie, and one file
// serving as both `any` and `maskable`.

function verify(root, proj, manifestName, flattened = new Set()) {
  const errors = [], warns = [], notes = [];
  const E = (m) => errors.push(m), W = (m) => warns.push(m), N = (m) => notes.push(m);
  const mp = path.join(proj.staticDir, manifestName);
  const raw = readIf(mp);
  if (!raw) { E(`no manifest at ${path.relative(root, mp)}`); return { errors, warns, notes }; }
  let m; try { m = JSON.parse(raw); } catch (err) { E(`manifest is not valid JSON: ${err.message}`); return { errors, warns, notes }; }

  if (!m.name) E("manifest.name missing — required for installability");
  if (!m.short_name) W("manifest.short_name missing — the launcher falls back to name and may truncate it");
  else if (m.short_name.length > 12) W(`short_name "${m.short_name}" is ${m.short_name.length} chars — home screens truncate past ~12`);
  if (!m.description) W("manifest.description missing — shown in the install dialog");
  if (!m.start_url) E("manifest.start_url missing — required for installability");
  if (!m.display) W("manifest.display missing — defaults to browser, so no standalone window");
  if (!m.id) N("manifest.id absent — set it so the app keeps its identity if start_url ever changes");
  for (const k of ["theme_color", "background_color"]) {
    if (!m[k]) W(`manifest.${k} missing`);
    else if (!isHex(m[k])) E(`manifest.${k} "${m[k]}" is not a hex colour`);
  }
  if (m.start_url && m.scope && !String(m.start_url).startsWith(String(m.scope))) {
    E(`start_url "${m.start_url}" falls outside scope "${m.scope}"`);
  }

  const icons = Array.isArray(m.icons) ? m.icons : [];
  if (!icons.length) E("manifest.icons is empty");
  // Map a served URL back to a file. The base is whatever this project's static dir serves as,
  // so an Angular /assets/ prefix is stripped while a plain project keeping icons in /assets/ is not.
  const base = hrefBase(root, proj.staticDir).replace(/^\/+/, "");
  const toFile = (src) => {
    let p = String(src).replace(/^https?:\/\/[^/]+/, "").replace(/^\/+/, "");
    if (base && p.startsWith(base)) p = p.slice(base.length);
    return path.join(proj.staticDir, p);
  };
  const purposes = (ic) => String(ic.purpose || "any").trim().split(/\s+/);
  const anySrcs = new Set(), maskSrcs = new Set();

  for (const ic of icons) {
    const f = toFile(ic.src);
    if (!fs.existsSync(f)) { E(`icon ${ic.src} does not resolve to a file (looked at ${path.relative(root, f)})`); continue; }
    const p = purposes(ic);
    if (p.includes("any")) anySrcs.add(ic.src);
    if (p.includes("maskable")) maskSrcs.add(ic.src);
    if (p.length > 1 && p.includes("maskable") && p.includes("any")) {
      E(`icon ${ic.src} declares "any maskable" — one file cannot satisfy both; Android crops it and the browser tab shows the cropped art`);
    }
    if (f.toLowerCase().endsWith(".png")) {
      const info = pngInfo(f);
      if (!info) { E(`icon ${ic.src} is not a readable PNG`); continue; }
      const declared = String(ic.sizes || "").split(/\s+/)[0];
      if (declared && declared !== "any" && declared !== `${info.width}x${info.height}`) {
        E(`icon ${ic.src} declares ${declared} but the file is ${info.width}x${info.height}`);
      }
    }
  }
  const big = (set, n) => [...set].some((s) => icons.find((i) => i.src === s && parseInt(String(i.sizes), 10) >= n));
  if (!big(anySrcs, 192)) E('no `purpose: "any"` icon of at least 192x192 — required for installability');
  if (!big(anySrcs, 512)) E('no `purpose: "any"` icon of at least 512x512 — required for installability');
  if (!maskSrcs.size) E('no `purpose: "maskable"` icon — Android will letterbox the icon inside a white blob');
  else if (!big(maskSrcs, 512)) W("maskable icon smaller than 512x512 — splash screens will upscale it");
  for (const s of maskSrcs) if (anySrcs.has(s)) E(`${s} is listed as both any and maskable — they must be different files (maskable needs ~20% padding)`);

  const apple = path.join(proj.staticDir, ASSETS.apple);
  if (!fs.existsSync(apple)) W(`${ASSETS.apple} missing — iOS falls back to a screenshot of the page`);
  else {
    const info = pngInfo(apple);
    if (info && (info.width !== 180 || info.height !== 180)) W(`${ASSETS.apple} is ${info.width}x${info.height}, expected 180x180`);
    if (info && HAS_ALPHA(info.colorType)) {
      if (flattened.has(ASSETS.apple)) N(`${ASSETS.apple} has an alpha channel but was composited over a solid background — iOS is fine`);
      else W(`${ASSETS.apple} has an alpha channel — any transparent pixel renders black on the iOS home screen`);
    }
  }
  for (const mf of [ASSETS.mask192, ASSETS.mask512]) {
    const p = path.join(proj.staticDir, mf);
    if (!fs.existsSync(p)) continue;
    const info = pngInfo(p);
    if (info && HAS_ALPHA(info.colorType) && !flattened.has(mf)) {
      W(`${mf} has an alpha channel — a maskable icon must fill its square; transparent pixels leave holes in the Android mask`);
    }
  }
  if (!m.screenshots?.length) N("no screenshots[] — Chrome shows the minimal install prompt instead of the rich card");

  if (proj.html) {
    const html = readIf(proj.html) || "";
    const need = [[/<link[^>]+rel=["']manifest["']/i, "<link rel=manifest>"],
      [/<link[^>]+rel=["']apple-touch-icon["']/i, "<link rel=apple-touch-icon>"],
      [/<meta[^>]+name=["']theme-color["']/i, "<meta theme-color>"],
      [/<meta[^>]+name=["']apple-mobile-web-app-title["']/i, "<meta apple-mobile-web-app-title>"]];
    for (const [rx, label] of need) if (!rx.test(html)) W(`${label} missing from ${path.relative(root, proj.html)}`);
    const t = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    if (isScaffold(t)) E(`<title>${t || ""}</title> is still a scaffold placeholder`);
    for (const mm of html.matchAll(/(?:href|content)=["'](\/[^"']+\.(?:png|svg|ico|webmanifest|json))["']/gi)) {
      const f = path.join(proj.staticDir, mm[1].replace(/^\/+/, "").replace(/^assets\//, ""));
      if (!fs.existsSync(f)) W(`<head> references ${mm[1]} but no such file on disk`);
    }
  } else N("no HTML entry point found — <head> tags were not checked");

  return { errors, warns, notes };
}

// ──────────────────────────────────────────────────────────── main

function hrefBase(root, staticDir) {
  const rel = (path.relative(root, staticDir) || ".").split(path.sep).join("/");
  if (["." , "public", "static", "www"].includes(rel)) return "/";
  if (rel === "src/assets") return "/assets/";
  return "/" + rel + "/";
}

const SRC_DIRS = [".", "public", "static", "branding", "brand", "assets", "src/assets", "src", "www"];
const SRC_RX = /^(icon|logo|favicon|mark|app-?icon|brand|logomark)[-_.]?\w*\.(svg|png)$/i;
// Everything this tool writes except favicon.svg, which is a verbatim copy of the source and so
// is safe to pick up again. Without this, a second run selects icon-512.png as the "source".
const DERIVED = new Set(Object.values(ASSETS).filter((n) => n !== ASSETS.svg));

function autoSource(root, staticDir) {
  const found = [];
  for (const d of [path.relative(root, staticDir) || ".", ...SRC_DIRS]) {
    const abs = path.join(root, d);
    for (const f of listIf(abs)) {
      if (!SRC_RX.test(f) || DERIVED.has(f)) continue;
      const p = path.join(abs, f);
      const isSvg = f.toLowerCase().endsWith(".svg");
      const px = isSvg ? 100000 : (pngInfo(p)?.width || 0);
      if (!isSvg && px < 180) continue; // too small to scale up cleanly
      found.push({ p, isSvg, px });
    }
  }
  found.sort((a, b) => (b.isSvg - a.isSvg) || (b.px - a.px));
  return found[0]?.p || null;
}

function collectScreenshots(staticDir, href) {
  const shots = [];
  for (const dir of [staticDir, path.join(staticDir, "screenshots")]) {
    for (const f of listIf(dir)) {
      if (!/^screenshot[-_.]?.*\.(png|jpg|jpeg|webp)$/i.test(f)) continue;
      const p = path.join(dir, f);
      const info = f.toLowerCase().endsWith(".png") ? pngInfo(p) : null;
      const rel = path.relative(staticDir, p).split(path.sep).join("/");
      const e = { src: href(rel), type: `image/${f.split(".").pop().toLowerCase().replace("jpg", "jpeg")}` };
      if (info) { e.sizes = `${info.width}x${info.height}`; e.form_factor = info.width > info.height ? "wide" : "narrow"; }
      shots.push(e);
    }
  }
  return shots;
}

function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || (!pos.length && !flags.source)) { process.stdout.write(HELP); return 0; }

  const root = path.resolve(pos[0] || ".");
  if (!fs.existsSync(root)) { warn(`no such directory: ${root}`); return 2; }
  const proj = detectProject(root);
  const manifestName = proj.staticDir && findManifest(proj.staticDir)?.name || "site.webmanifest";

  out(`project      ${root}`);
  out(`framework    ${proj.framework}  (head lives in ${proj.headHint})`);
  out(`static dir   ${path.relative(root, proj.staticDir) || "."}   [via ${proj.staticVia}]`);
  out(`html entry   ${proj.html ? path.relative(root, proj.html) : "(none — head snippet will be printed)"}`);

  if (flags["verify-only"]) {
    const v = verify(root, proj, manifestName);
    report(v);
    return v.errors.length ? 1 : 0;
  }

  // ── source mark
  const source = flags.source ? path.resolve(root, flags.source)
    : (pos[1] ? path.resolve(root, pos[1]) : autoSource(root, proj.staticDir));
  if (!source || !fs.existsSync(source)) {
    warn("no source mark found. Pass --source <file>, or author a 512x512 SVG first.");
    hint("looked for icon/logo/favicon/mark/brand .svg or .png in: " + SRC_DIRS.join(", "));
    return 2;
  }
  const isSvg = source.toLowerCase().endsWith(".svg");
  const srcText = isSvg ? readIf(source) : null;
  if (isSvg && !parseSvg(srcText || "")) { warn(`${source} does not parse as SVG`); return 2; }
  out(`source mark  ${path.relative(root, source)}${isSvg ? "" : "  (raster — SVG gives sharper small sizes)"}`);

  // ── colours
  const colors = sampleColors(root, srcText);
  const ident = gatherIdentity(root, proj);
  const theme = norm6(flags["theme-color"]) || ident.themeColor || colors.theme?.hex || "#0b0b0f";
  const bg = norm6(flags["bg-color"]) || ident.bgColor || colors.background?.hex || "#ffffff";
  if (!flags["theme-color"] && !ident.themeColor && colors.theme) {
    NOTES.push(`theme_color ${theme} inferred — ${colors.theme.why}. Override with --theme-color.`);
  }

  const name = flags.name || ident.name;
  const shortName = flags["short-name"] || ident.shortName ||
    (name.length <= 12 ? name : name.split(/\s+/)[0].slice(0, 12));
  const startUrl = flags["start-url"] || "/";
  const href = (f) => hrefBase(root, proj.staticDir) + f;

  const plan = {
    name, shortName, description: flags.description || ident.description || null,
    lang: flags.lang || "en", id: flags.id || startUrl, startUrl,
    scope: flags.scope || "/", display: flags.display || "standalone",
    orientation: flags.orientation || null, themeColor: theme,
    themeColorDark: norm6(flags["theme-color-dark"]) || theme, bgColor: bg,
    siteUrl: flags["site-url"] || null,
    categories: (flags.categories || "").split(",").map((s) => s.trim()).filter(Boolean),
    screenshots: collectScreenshots(proj.staticDir, href), href,
  };

  // ── rasteriser
  const { chosen, all } = pickRasterizer(isSvg);
  const canPad = !!chosen?.pad || isSvg; // SVG derivatives carry their own padding
  if (!chosen) {
    warn(`no rasteriser found for a ${isSvg ? "SVG" : "raster"} source. PNG/ICO assets cannot be built.`);
    for (const r of RASTERIZERS.filter((r) => (isSvg ? r.svg : r.raster))) hint(`install ${r.name}: ${r.install}`);
  } else {
    out(`rasteriser   ${chosen.name}${all.length > 1 ? `  (also available: ${all.slice(1).map((r) => r.name).join(", ")})` : ""}`);
    if (!canPad) warn(`${chosen.name} cannot pad a raster source — maskable and apple icons will be skipped. Fix: brew install imagemagick`);
  }

  // ── what we intend to produce
  const targets = [];
  if (isSvg) targets.push([ASSETS.svg, "vector favicon"]);
  if (chosen) {
    targets.push([ASSETS.png96, 96], [ASSETS.any192, 192], [ASSETS.any512, 512], [ASSETS.ico, "16/32/48"]);
    if (canPad) targets.push([ASSETS.apple, 180], [ASSETS.mask192, "192 padded"], [ASSETS.mask512, "512 padded"]);
    if (flags.og && isSvg) targets.push([ASSETS.og, "1200x630"]);
    else if (flags.og) warn("--og needs an SVG source to compose the 1200x630 canvas — og-image.png will not be generated");
  }
  const planned = new Set(targets.map((t) => t[0]));
  for (const f of Object.values(ASSETS)) if (ex(proj.staticDir, f)) planned.add(f);

  out("");
  out("manifest");
  for (const [k, v] of Object.entries(buildManifest(plan, planned))) {
    out(`  ${k.padEnd(16)} ${typeof v === "object" ? JSON.stringify(v).slice(0, 96) : v}`);
  }
  out("");
  out(`assets -> ${path.relative(root, proj.staticDir) || "."}/`);
  for (const [f, note] of targets) out(`  ${ex(proj.staticDir, f) ? "overwrite" : "create   "} ${f.padEnd(24)} ${note}`);

  const { block: headBlock, managed: headManaged } = buildHead(plan, planned, manifestName);
  let headPlan = null;
  if (proj.html && !flags["no-head"]) {
    headPlan = injectHead(ident.html || "", headBlock, headManaged);
    out("");
    out(`<head> in ${path.relative(root, proj.html)}`);
    if (headPlan.failed) out("  ! no <head> anchor found — snippet will be printed instead");
    for (const r of headPlan.removed) out(`  remove  ${r.slice(0, 96)}`);
    out(`  insert  ${headBlock.trim().split("\n").length} lines (between sentinel comments, re-runs replace them)`);
  }

  if (flags["dry-run"]) {
    out("");
    out("dry run — nothing written. Re-run without --dry-run to apply.");
    flush();
    return 0;
  }

  // ── emit
  fs.mkdirSync(proj.staticDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "cwm-"));
  const generated = new Set();
  const flattened = new Set(); // composited onto a solid colour — the only basis for excusing alpha
  const dst = (f) => path.join(proj.staticDir, f);
  const raster = (src, file, size, { pad = 0, bgc = null, flat = false } = {}) => {
    if (!chosen) return false;
    let r, didFlatten = false;
    if (pad && chosen.runPad) { r = chosen.runPad(src, dst(file), size, pad, bgc); didFlatten = true; }
    else if (flat && chosen.runFlat) { r = chosen.runFlat(src, dst(file), size, bgc); didFlatten = true; }
    else {
      r = chosen.run(src, dst(file), size);
      if (flat || pad) warn(`${chosen.name} cannot flatten — ${file} keeps its alpha channel; iOS/Android will show transparent pixels as black. Fix: brew install imagemagick`);
    }
    if (r.status !== 0) { warn(`${chosen.name} failed on ${file}: ${(r.stderr || r.stdout || "").trim().slice(0, 200)}`); return false; }
    generated.add(file); if (didFlatten) flattened.add(file);
    return true;
  };

  try {
    if (isSvg) {
      fs.writeFileSync(dst(ASSETS.svg), srcText); generated.add(ASSETS.svg);
      // padding baked into the SVG, so any rasteriser produces a correct maskable
      const maskSvg = path.join(tmp, "maskable.svg");
      const appleSvg = path.join(tmp, "apple.svg");
      fs.writeFileSync(maskSvg, deriveSvg(srcText, { size: 512, pad: 0.1, bg }));
      fs.writeFileSync(appleSvg, deriveSvg(srcText, { size: 512, pad: 0.06, bg }));
      raster(source, ASSETS.png96, 96);
      raster(source, ASSETS.any192, 192);
      raster(source, ASSETS.any512, 512);
      raster(maskSvg, ASSETS.mask192, 192, { flat: true, bgc: bg });
      raster(maskSvg, ASSETS.mask512, 512, { flat: true, bgc: bg });
      raster(appleSvg, ASSETS.apple, 180, { flat: true, bgc: bg });
      if (flags.og) {
        const ogSvg = path.join(tmp, "og.svg");
        const inner = deriveSvg(srcText, { size: 630, pad: 0.28, bg });
        fs.writeFileSync(ogSvg, `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${bg}"/><svg x="285" y="0" width="630" height="630" viewBox="0 0 630 630">${parseSvg(inner).inner}</svg></svg>`);
        if (chosen?.runWH) { const r = chosen.runWH(ogSvg, dst(ASSETS.og), 1200, 630); if (r.status === 0) generated.add(ASSETS.og); else warn(`og-image failed: ${(r.stderr || "").trim().slice(0, 160)}`); }
        else warn(`${chosen ? chosen.name : "no rasteriser"} cannot render non-square output — og-image.png skipped`);
      }
    } else {
      raster(source, ASSETS.png96, 96);
      raster(source, ASSETS.any192, 192);
      raster(source, ASSETS.any512, 512);
      if (canPad) {
        raster(source, ASSETS.mask192, 192, { pad: 0.1, bgc: bg });
        raster(source, ASSETS.mask512, 512, { pad: 0.1, bgc: bg });
        raster(source, ASSETS.apple, 180, { pad: 0.06, bgc: bg });
      }
    }

    // .ico assembled here, from PNGs the rasteriser made — no ICO encoder needed
    if (chosen) {
      const parts = [];
      for (const s of [16, 32, 48]) {
        const p = path.join(tmp, `ico-${s}.png`);
        if (chosen.run(source, p, s).status === 0) parts.push(p);
      }
      if (parts.length) { fs.writeFileSync(dst(ASSETS.ico), buildIco(parts)); generated.add(ASSETS.ico); }
      else warn("could not build favicon.ico — no PNG sizes were produced");
    }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }

  const present = new Set(Object.values(ASSETS).filter((f) => ex(proj.staticDir, f)));
  plan.screenshots = collectScreenshots(proj.staticDir, href);
  fs.writeFileSync(dst(manifestName), JSON.stringify(buildManifest(plan, present), null, 2) + "\n");
  generated.add(manifestName);

  const { block: finalHead, managed: finalManaged } = buildHead(plan, present, manifestName);
  const original = proj.html ? readIf(proj.html) : null;
  if (proj.html && !flags["no-head"] && original === null) {
    warn(`could not read ${path.relative(root, proj.html)} — writing head-snippet.html instead of editing it`);
  }
  if (proj.html && !flags["no-head"] && original !== null) {
    // First modification only; a re-run replaces just our own block, so one backup
    // is enough. Recorded so the user can undo without assuming the project is under git.
    if (!original.includes(START)) {
      const bak = proj.html + ".bak";
      fs.writeFileSync(bak, original);
      NOTES.push(`original ${path.basename(proj.html)} saved to ${path.relative(root, bak)} before the first edit`);
    }
    const res = injectHead(original, finalHead, finalManaged);
    if (res.failed) { warn(`no <head> anchor in ${proj.html} — snippet written to head-snippet.html instead`); fs.writeFileSync(dst("head-snippet.html"), finalHead + "\n"); }
    else fs.writeFileSync(proj.html, res.html);
  } else {
    fs.writeFileSync(dst("head-snippet.html"), finalHead + "\n");
    NOTES.push(`${proj.framework}: merge ${path.relative(root, dst("head-snippet.html"))} into ${proj.headHint} by hand`);
  }

  out("");
  out(`wrote ${[...generated].length} asset(s) + ${manifestName}`);
  const v = verify(root, proj, manifestName, flattened);
  report(v);
  flush();
  return v.errors.length ? 1 : 0;
}

function report(v) {
  out("");
  out("verify");
  for (const e of v.errors) out(`  FAIL  ${e}`);
  for (const w of v.warns) out(`  warn  ${w}`);
  if (!v.errors.length && !v.warns.length) out("  all checks passed");
  for (const n of [...v.notes, ...NOTES]) out(`  note  ${n}`);
}
function flush() { if (OUT.length) process.stdout.write(OUT.join("\n") + "\n"); OUT.length = 0; }

const code = main();
flush();
process.exit(code);
