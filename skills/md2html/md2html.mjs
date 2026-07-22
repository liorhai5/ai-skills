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

// Minimal, readable styling for browser viewing. Google Docs discards almost all
// of this on paste — it's here so the intermediate HTML is pleasant to look at.
const STYLE = `
  body { max-width: 820px; margin: 2rem auto; padding: 0 1.25rem;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a1a; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.6em 0 0.6em; }
  h1 { font-size: 1.9em; } h2 { font-size: 1.5em; } h3 { font-size: 1.25em; }
  p { margin: 0.8em 0; }
  a { color: #1155cc; }
  img { max-width: 100%; height: auto; }
  pre { background: #f6f8fa; padding: 0.9em 1em; overflow: auto; border-radius: 6px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; }
  pre code { font-size: 0.85em; }
  :not(pre) > code { background: #f0f0f0; padding: 0.1em 0.35em; border-radius: 4px; }
  blockquote { margin: 0.8em 0; padding: 0 1em; color: #555; border-left: 3px solid #ddd; }
  table { border-collapse: collapse; margin: 1em 0; }
  th, td { border: 1px solid #ccc; padding: 0.4em 0.75em; text-align: left; }
  th { background: #f6f8fa; }
  ul, ol { padding-left: 1.5em; }
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
