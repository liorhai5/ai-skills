#!/usr/bin/env node
// md2html — convert a markdown file to a self-contained HTML file for pasting
// into Google Docs. Single file, Node built-ins only: every capability (markdown
// parse, mermaid render, SVG rasterize) is served by tools detected on the
// machine; when a tool is missing the skill suggests an install, never bundles.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const VERSION = "2.0.0";

const USAGE = `md2html — convert a markdown file to a self-contained HTML file and open it in the browser.

Usage:
  md2html <file.md>              convert and open in the default browser
  md2html <file.md> --no-open    convert only, do not open
  md2html <file.md> --no-render  skip diagram rendering (mermaid/SVG left as-is)
  md2html <file.md> --mermaid-cmd "<cmd {in} {out}>"
                                 use a custom mermaid renderer (argv, no shell)
  md2html --help                 show this help
  md2html --version              show version

Output:
  Writes <file>.html next to the input file (overwriting any existing one),
  then opens it so you can select-all, copy, and paste into Google Docs.

Tools (detected on this machine, first match wins; none are bundled):
  markdown (required)  pandoc | markdown-it (npx cache) | python3 markdown module
  mermaid   (optional) mmdc — headless Chrome, a few seconds per diagram
  svg→png   (optional) rsvg-convert | inkscape | cairosvg | magick/convert
Missing optional tools degrade honestly (code block / inline SVG) with an
install hint on stderr; a missing markdown engine is fatal (nothing to parse with).
`;

// ---------------------------------------------------------------------------
// Tool detection (memoized probes)

const _probes = new Map();
function probe(cmd, args = ["--version"]) {
  const key = `${cmd} ${args.join(" ")}`;
  if (!_probes.has(key)) {
    try {
      const r = spawnSync(cmd, args, { stdio: "ignore", timeout: 15000 });
      _probes.set(key, !r.error && r.status === 0);
    } catch {
      _probes.set(key, false);
    }
  }
  return _probes.get(key);
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: "pipe", timeout: 60000, ...opts });
}

// ---------------------------------------------------------------------------
// Capability: markdown → HTML fragment (required)

const MD_ENGINES = [
  {
    name: "pandoc",
    hint: "brew install pandoc  (recommended: full GFM — tables, task lists, footnotes)",
    detect: () => probe("pandoc"),
    render: (file) => run("pandoc", ["-f", "gfm", "-t", "html", file]),
  },
  {
    name: "markdown-it",
    hint: "npm i -g markdown-it  (no footnotes/task lists)",
    detect: () => probe("npx", ["--no-install", "markdown-it", "--version"]),
    render: (file) => run("npx", ["--no-install", "markdown-it", file]),
  },
  {
    name: "python3 markdown module",
    hint: "pip3 install markdown  (tables/footnotes via extensions; no task lists)",
    detect: () => probe("python3", ["-c", "import markdown"]),
    render: (file) =>
      run("python3", ["-m", "markdown", "-x", "tables", "-x", "fenced_code", "-x", "footnotes", file]),
  },
];

function detectMarkdownEngine() {
  return MD_ENGINES.find((e) => e.detect()) ?? null;
}

// ---------------------------------------------------------------------------
// Capability: mermaid fence → PNG (optional)

const MERMAID_HINT = "npm i -g @mermaid-js/mermaid-cli";

function detectMermaid(customCmd) {
  const custom = customCmd && customCmd.trim();
  if (custom) {
    const parts = custom.split(/\s+/);
    return {
      // argv substitution — {in}/{out} placeholders only, no shell.
      build: (inPath, outPath) => ({
        cmd: parts[0],
        args: parts.slice(1).map((p) => (p === "{in}" ? inPath : p === "{out}" ? outPath : p)),
      }),
    };
  }
  const mmdcArgs = (inPath, outPath) => ["-i", inPath, "-o", outPath, "-s", "2", "-b", "white"];
  if (probe("mmdc")) {
    return { build: (i, o) => ({ cmd: "mmdc", args: mmdcArgs(i, o) }) };
  }
  if (probe("npx", ["--no-install", "mmdc", "--version"])) {
    return { build: (i, o) => ({ cmd: "npx", args: ["--no-install", "mmdc", ...mmdcArgs(i, o)] }) };
  }
  return null;
}

// Matches a fenced ```mermaid block, capturing leading indent and body.
const MERMAID_FENCE = /^([ \t]*)```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*$/gm;

// Replace each ```mermaid fence with a local image reference to a rendered PNG
// (written into tmpDir), which the image inliner then base64-embeds. On any
// failure the fence is left untouched so it renders as a code block.
function renderMermaidFences(source, { customCmd, tmpDir, report }) {
  if (!MERMAID_FENCE.test(source)) return source;
  MERMAID_FENCE.lastIndex = 0;

  const renderer = detectMermaid(customCmd);
  if (!renderer) {
    report.missing.set("mermaid renderer (mmdc)", MERMAID_HINT);
    return source;
  }

  let i = 0;
  return source.replace(MERMAID_FENCE, (match, _indent, body) => {
    const inPath = path.join(tmpDir, `mermaid-${i}.mmd`);
    const outPath = path.join(tmpDir, `mermaid-${i}.png`);
    i += 1;
    try {
      fs.writeFileSync(inPath, `${body}\n`, "utf8");
      const { cmd, args } = renderer.build(inPath, outPath);
      const r = run(cmd, args);
      if (r.error || r.status !== 0 || !fs.existsSync(outPath)) {
        const detail = (r.stderr?.toString() || r.error?.message || "")
          .split("\n")
          .find((l) => l.trim());
        report.messages.push(
          `mermaid render failed, left as code block${detail ? `: ${detail.trim()}` : ""}`,
        );
        return match;
      }
      // encodeURI so a tmp path with spaces stays a single markdown URL token.
      return `![mermaid diagram](${encodeURI(outPath)})`;
    } catch (err) {
      report.messages.push(`mermaid render error, left as code block: ${err.message}`);
      return match;
    }
  });
}

// ---------------------------------------------------------------------------
// Capability: SVG → PNG (optional)

const SVG_HINT =
  "brew install librsvg  (or: inkscape, pip3 install cairosvg, imagemagick)";

const SVG_TOOLS = [
  {
    detect: () => probe("rsvg-convert"),
    build: (svg, png) => ({ cmd: "rsvg-convert", args: ["-z", "2", "-o", png, svg] }),
  },
  {
    detect: () => probe("inkscape"),
    build: (svg, png) => ({
      cmd: "inkscape",
      args: [svg, "--export-type=png", `--export-filename=${png}`],
    }),
  },
  {
    detect: () => probe("cairosvg"),
    build: (svg, png) => ({ cmd: "cairosvg", args: [svg, "-o", png, "-s", "2"] }),
  },
  {
    detect: () => probe("magick") || probe("convert", ["-version"]),
    build: (svg, png) => ({
      cmd: probe("magick") ? "magick" : "convert",
      args: [svg, png],
    }),
  },
];

let _svgTool; // undefined = unprobed, null = none
function detectSvgTool() {
  if (_svgTool === undefined) _svgTool = SVG_TOOLS.find((t) => t.detect()) ?? null;
  return _svgTool;
}

let svgCounter = 0;
function rasterizeSvg(absSvg, tmpDir) {
  const tool = detectSvgTool();
  if (!tool) return null;
  const out = path.join(tmpDir, `svg-${svgCounter++}.png`);
  try {
    const { cmd, args } = tool.build(absSvg, out);
    const r = run(cmd, args, { stdio: "ignore", timeout: 30000 });
    if (r.error || r.status !== 0 || !fs.existsSync(out)) return null;
    return out;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Frontmatter

// Strip a leading YAML frontmatter block ("---\n...\n---\n") from markdown source.
function stripFrontmatter(source) {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) return source;
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? source.slice(match[0].length) : source;
}

// ---------------------------------------------------------------------------
// Image inlining (dep-free; runs on any engine's HTML output)

const WARN_SINGLE_BYTES = 5 * 1024 * 1024; // warn above 5 MB for one image
const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // hard-fail above 10 MB inlined total

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

const FALLBACK_EXTS = [".webp", ".jpg", ".jpeg", ".png", ".gif", ".svg"];

// A src is "local" if it is neither a remote URL nor an already-inlined data URI.
function isLocalImage(src) {
  return !/^(https?:)?\/\//i.test(src) && !/^data:/i.test(src);
}

function resolveLocalPath(src, baseDir) {
  const decoded = decodeURIComponent(src.split(/[?#]/)[0]);
  const resolved = path.isAbsolute(decoded) ? decoded : path.resolve(baseDir, decoded);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  const ext = path.extname(resolved);
  const base = ext ? resolved.slice(0, -ext.length) : resolved;
  for (const candidate of FALLBACK_EXTS) {
    const alt = `${base}${candidate}`;
    if (alt !== resolved && fs.existsSync(alt) && fs.statSync(alt).isFile()) return alt;
  }
  return null;
}

// Stateful inliner: tracks cumulative inlined bytes across one conversion so the
// total size guard can fire. Local .svg refs are rasterized to PNG when a tool is
// present (PNG survives the Docs paste); otherwise inlined as svg+xml + flagged.
function createImageInliner(baseDir, { tmpDir, report, rasterize }) {
  let totalBytes = 0;

  return {
    inline(src) {
      if (!isLocalImage(src)) return null;

      let abs = resolveLocalPath(src, baseDir);
      if (!abs) {
        console.error(`[md2html] image not found, left as-is: ${src}`);
        return null;
      }

      if (path.extname(abs).toLowerCase() === ".svg" && rasterize) {
        if (detectSvgTool()) {
          const png = rasterizeSvg(abs, tmpDir);
          if (png) {
            abs = png;
          } else {
            report.messages.push(
              `SVG rasterization failed, inlined as-is (Google Docs may not show it): ${path.basename(abs)}`,
            );
          }
        } else {
          report.missing.set("svg rasterizer", SVG_HINT);
          report.messages.push(
            `SVG inlined as-is (Google Docs may not show it): ${path.basename(abs)}`,
          );
        }
      }

      const buf = fs.readFileSync(abs);
      if (buf.length > WARN_SINGLE_BYTES) {
        console.error(
          `[md2html] large image (${(buf.length / 1024 / 1024).toFixed(1)} MB): ${path.basename(abs)}`,
        );
      }

      totalBytes += buf.length;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error(
          `inlined image payload exceeds ${MAX_TOTAL_BYTES / 1024 / 1024} MB — aborting to avoid an unusable HTML file`,
        );
      }

      const ext = path.extname(abs).toLowerCase();
      const mime = MIME_BY_EXT[ext] || "application/octet-stream";
      return `data:${mime};base64,${buf.toString("base64")}`;
    },
  };
}

// Rewrite local <img src="..."> to base64 data URIs. Engines emit double-quoted
// attributes, and a data URI never contains a double quote, so a targeted string
// replace within each tag is safe.
function inlineImages(html, inliner) {
  return html.replace(/<img\b[^>]*>/g, (tag) => {
    const m = tag.match(/\ssrc="([^"]*)"/);
    if (!m) return tag;
    const dataUri = inliner.inline(m[1]);
    return dataUri ? tag.replace(m[0], ` src="${dataUri}"`) : tag;
  });
}

// ---------------------------------------------------------------------------
// HTML template

// Reference document style for browser viewing and rich paste. Docs may approximate
// individual properties; clipboard fidelity is verified separately from HTML.
// Fonts resolve locally only. Missing Madefor faces fall back through CSS.
const STYLE = `
  @font-face { font-family: "Wix Madefor Display"; font-style: normal; font-weight: 400;
    src: local("WixMadeforDisplay-Regular"), local("Wix Madefor Display Regular"),
      local("WixMadeforDisplayApp-Regular"), local("Wix Madefor Display App"); }
  @font-face { font-family: "Wix Madefor Display"; font-style: normal; font-weight: 700;
    src: local("WixMadeforDisplay-Bold"), local("Wix Madefor Display Bold"),
      local("WixMadeforDisplayApp-Bold"), local("Wix Madefor Display App Bold"); }
  @font-face { font-family: "Wix Madefor Text"; font-style: normal; font-weight: 400;
    src: local("WixMadeforText-Regular"), local("Wix Madefor Text Regular"),
      local("WixMadeforTextApp-Regular"), local("Wix Madefor Text App"); }
  @font-face { font-family: "Wix Madefor Text"; font-style: normal; font-weight: 700;
    src: local("WixMadeforText-Bold"), local("Wix Madefor Text Bold"),
      local("WixMadeforTextApp-Bold"), local("Wix Madefor Text App Bold"); }
  @font-face { font-family: "Wix Madefor Text"; font-style: italic; font-weight: 400;
    src: local("WixMadeforText-Italic"), local("Wix Madefor Text Italic"),
      local("WixMadeforTextApp-Italic"), local("Wix Madefor Text App Italic"); }
  @font-face { font-family: "Wix Madefor Text"; font-style: italic; font-weight: 700;
    src: local("WixMadeforText-BoldItalic"), local("Wix Madefor Text Bold Italic"),
      local("WixMadeforTextApp-BoldItalic"), local("Wix Madefor Text App Bold Italic"); }
  body { box-sizing: border-box; width: 100%; max-width: 819px; margin: 24pt auto;
    padding: 0 24pt; background: #ffffff; color: #1a1a1a;
    font: 400 12pt/1.15 "Wix Madefor Display", "Wix Madefor Text", Arial, sans-serif;
    overflow-wrap: anywhere; }
  h1, h2, h3, h4, h5, h6 { color: #20252b; font-weight: 700; line-height: 1.25; }
  h1 { font-size: 18pt; font-weight: 400; margin: 21pt 0 8pt; }
  h2 { font-size: 14pt; font-weight: 400; text-decoration: underline; margin: 10pt 0; }
  h3 { font-size: 12pt; margin: 18pt 0 7pt; }
  h4 { font-size: 12pt; font-style: italic; margin: 14pt 0 7pt; }
  h5 { font-size: 11pt; font-style: italic; margin: 12pt 0 4pt; }
  h6 { font-size: 11pt; font-weight: 400; font-style: italic; color: #4f5964;
    margin: 12pt 0 4pt; }
  body > h1:first-child { font-size: 26pt; font-weight: 400; margin: 0 0 10pt; }
  p { margin: 10pt 0; }
  a { color: #185abc; text-decoration: underline; }
  img { display: block; max-width: 100%; height: auto; margin: 8pt 0; }
  figure { margin: 12pt 0 16pt; }
  caption, figcaption { color: #59616b; font-size: 9.5pt; text-align: left; }
  caption { margin-bottom: 8pt; }
  code { font: 10pt/1.5 "Courier New", monospace; }
  :not(pre) > code { background: #edf0f3; padding: 1pt 3pt; }
  pre { background: #f1f3f5; padding: 12pt; margin: 12pt 0 16pt;
    white-space: pre-wrap; overflow-wrap: anywhere; }
  pre code { display: block; background: transparent; padding: 0; }
  blockquote { color: #4f5964; border-left: 2px solid #aab2bb;
    margin: 12pt 0; padding: 8pt 12pt; }
  blockquote > :last-child { margin-bottom: 0; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed;
    margin: 12pt 0 16pt; background: #ffffff; font: inherit; }
  th, td { border: 0.625px solid #cccccc; padding: 16pt 9pt;
    background: #ffffff; color: #1a1a1a; font: inherit;
    text-align: left; vertical-align: top; }
  th { background: #f6f8fa; font-weight: 700; }
  th p, td p { margin: 0; }
  tfoot th, tfoot td { background: #ffffff; color: #252a30; font-weight: 700;
    border-top: 1.5px solid #89939e; border-bottom: 0; }
  ul, ol { margin: 8pt 0 12pt; padding-left: 20pt; }
  li { margin-bottom: 4pt; }
  ul ul, ul ol, ol ul, ol ol { margin: 4pt 0; }
  hr { border: 0; height: 0; padding: 0; margin: 24pt 0; }
  @media (max-width: 480px) {
    body { padding: 0 12pt; }
  }
`;

// Keep ordinary select-all/copy, with rich HTML independent of viewport sizing.
// Only a full-document selection is handled; errors retain the browser's copy.
const COPY_SCRIPT = String.raw`
(() => {
  const copyWidth = 755; // Matches the accepted pageless reference, independent of browser width.
  const colors = { "✓": "#19643c", "⚠": "#8a6100", "✕": "#a12b2b" };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const symbols = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (/[✓⚠✕]/.test(node.data) && !node.parentElement.closest("pre,code,script,style")) symbols.push(node);
  }
  for (const node of symbols) {
    const fragment = document.createDocumentFragment();
    for (const part of node.data.split(/([✓⚠✕])/)) {
      const text = document.createTextNode(part);
      if (!colors[part]) { fragment.append(text); continue; }
      const span = document.createElement("span");
      span.style.color = colors[part];
      span.append(text);
      fragment.append(span);
    }
    node.replaceWith(fragment);
  }

  document.addEventListener("copy", (event) => {
    const selection = document.getSelection();
    const children = [...document.body.children].filter(el => !el.matches("script,style"));
    const text = value => value.replace(/\s+/g, " ").trim();
    if (!event.clipboardData || !selection || !children.length ||
        !selection.containsNode(children[0], true) || !selection.containsNode(children.at(-1), true) ||
        text(selection.toString()) !== text(document.body.innerText)) return;
    try {
      const copy = document.body.cloneNode(true);
      const originals = [...document.body.querySelectorAll("*")];
      const clones = [...copy.querySelectorAll("*")];
      const properties = ["font-family", "font-size", "font-weight", "font-style", "color",
        "background-color", "text-align", "text-decoration", "vertical-align", "white-space", "visibility",
        "margin-top", "margin-bottom", "padding-top", "padding-right", "padding-bottom", "padding-left",
        "border-top", "border-right", "border-bottom", "border-left"];
      originals.forEach((original, i) => {
        const clone = clones[i], style = getComputedStyle(original);
        if (style.display === "none") { clone.remove(); return; }
        if (style.visibility === "hidden" || style.visibility === "collapse") {
          if (original.matches("img,input,textarea,select,canvas,video,audio,iframe,object,embed")) {
            clone.remove();
            return;
          }
          // Preserve table/list structure and visible descendants, excluding hidden text/comments.
          for (const node of [...clone.childNodes]) {
            if (node.nodeType !== Node.ELEMENT_NODE) node.remove();
          }
        }
        for (const property of properties) clone.style.setProperty(property, style.getPropertyValue(property));
        const leading = parseFloat(style.lineHeight) / parseFloat(style.fontSize);
        clone.style.lineHeight = Number.isFinite(leading) ? String(leading) : "normal";
        if (original.matches("table")) {
          clone.setAttribute("width", String(copyWidth));
          clone.style.width = copyWidth + "px";
          clone.style.borderCollapse = "collapse";
          clone.style.margin = "0";
        }
        if (original.matches("td,th,col,colgroup")) {
          clone.removeAttribute("width");
          clone.style.removeProperty("width");
          clone.style.margin = "0";
        }
        if (original.matches("p") && original.closest("td,th")) clone.style.margin = "0";
        if (original.matches("img") && original.naturalWidth && original.naturalHeight) {
          const width = Math.min(original.naturalWidth, copyWidth);
          const height = Math.round(original.naturalHeight * width / original.naturalWidth);
          clone.setAttribute("width", String(width));
          clone.setAttribute("height", String(height));
          clone.style.width = width + "px";
          clone.style.height = height + "px";
          clone.style.removeProperty("max-width");
        }
      });
      copy.querySelectorAll("script,style,link,meta").forEach(el => el.remove());
      event.clipboardData.setData("text/html", copy.innerHTML);
      event.clipboardData.setData("text/plain", selection.toString());
      event.preventDefault();
    } catch (error) {
      console.warn("md2html: using native copy after formatting failed", error);
    }
  });
})();
`;

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapDocument(bodyHtml, title) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
${bodyHtml}
<script>${COPY_SCRIPT}</script>
</body>
</html>
`;
}

// Pull a document title from the first ATX heading, if any.
function firstHeading(markdown) {
  const match = markdown.match(/^#{1,6}\s+(.+?)\s*#*\s*$/m);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Pipeline

// Convert markdown source to a complete, self-contained HTML document string.
// Synchronous throughout (spawnSync for every tool). Throws with .fatal = true
// when no markdown engine is available.
function convert(mdSource, { baseDir, title, noRender, mermaidCmd, report }) {
  const body = stripFrontmatter(mdSource);

  const engine = detectMarkdownEngine();
  if (!engine) {
    const err = new Error(
      "no markdown engine found — install one of:\n" +
        MD_ENGINES.map((e) => `  - ${e.name}: ${e.hint}`).join("\n"),
    );
    err.fatal = true;
    throw err;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "md2html-"));
  try {
    const source = noRender
      ? body
      : renderMermaidFences(body, { customCmd: mermaidCmd, tmpDir, report });

    // Engines read from a file; write the (possibly pre-passed) source out.
    const srcPath = path.join(tmpDir, "input.md");
    fs.writeFileSync(srcPath, source, "utf8");
    const r = engine.render(srcPath);
    if (r.error || r.status !== 0) {
      throw new Error(
        `${engine.name} failed: ${(r.stderr?.toString() || r.error?.message || "unknown error").trim()}`,
      );
    }
    const fragment = r.stdout.toString();

    const inliner = createImageInliner(baseDir, {
      tmpDir,
      report,
      rasterize: !noRender,
    });
    const withImages = inlineImages(fragment, inliner);

    const docTitle = title || firstHeading(body) || "document";
    return wrapDocument(withImages, docTitle);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// CLI

function fail(message) {
  console.error(`md2html: ${message}`);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }
  if (args.includes("--version") || args.includes("-v")) {
    console.log(VERSION);
    return;
  }

  let noOpen = false;
  let noRender = false;
  let mermaidCmd;
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--no-open") noOpen = true;
    else if (a === "--no-render") noRender = true;
    else if (a === "--mermaid-cmd") mermaidCmd = args[++i];
    else if (a.startsWith("--mermaid-cmd=")) mermaidCmd = a.slice("--mermaid-cmd=".length);
    else if (!a.startsWith("-")) positionals.push(a);
  }

  if (positionals.length === 0) {
    process.stderr.write(USAGE);
    process.exit(1);
  }
  if (positionals.length > 1) {
    fail("expected exactly one markdown file");
  }

  const input = path.resolve(process.cwd(), positionals[0]);
  if (!/\.(md|markdown)$/i.test(input)) {
    fail(`input must be a .md file: ${positionals[0]}`);
  }
  if (!fs.existsSync(input)) {
    fail(`file not found: ${positionals[0]}`);
  }

  const report = { messages: [], missing: new Map() };
  let html;
  try {
    const source = fs.readFileSync(input, "utf8");
    html = convert(source, {
      baseDir: path.dirname(input),
      title: path.basename(input, path.extname(input)),
      noRender,
      mermaidCmd,
      report,
    });
  } catch (err) {
    console.error(`md2html: ${err.fatal ? err.message : `conversion failed: ${err.message}`}`);
    process.exit(err.fatal ? 1 : 2);
  }

  const output = input.replace(/\.(md|markdown)$/i, ".html");
  fs.writeFileSync(output, html, "utf8");
  console.log(output);

  // Degradation is flagged loudly on stderr but never fatal (exit stays 0).
  for (const m of report.messages) console.error(`md2html: ${m}`);
  if (report.missing.size > 0) {
    console.error("md2html: some content degraded — install to render it:");
    for (const [tool, hint] of report.missing) {
      console.error(`  - ${tool}: ${hint}`);
    }
  }

  if (!noOpen) {
    spawn("open", [output], { stdio: "ignore", detached: true }).unref();
  }
}

main();
