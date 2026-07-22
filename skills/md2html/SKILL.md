---
name: md2html
description: Convert a local markdown file to a self-contained HTML file and open it in the browser, so it can be copy-pasted into Google Docs with formatting and images intact. Use when the user asks to "turn this markdown into a Google Doc", "paste this md into Docs", or "convert md to html for pasting".
argument-hint: "<path-to-markdown-file>"
---

# md2html

Convert the markdown file given in `$ARGUMENTS` to HTML and open it in the browser.
The user then selects-all (⌘A), copies (⌘C), and pastes (⌘V) into Google Docs.

## Run

The skill is a single dependency-free script (Node ≥ 18, no install step, nothing bundled).
Determine this SKILL.md's own directory as `{baseDir}`, then run:

```bash
node "{baseDir}/md2html.mjs" "$ARGUMENTS"
```

Flags: `--no-open` (convert only), `--no-render` (skip diagram/SVG rendering),
`--mermaid-cmd "<cmd {in} {out}>"` (custom mermaid renderer, argv with placeholders).

## How it works — env tools, never bundled libraries

Every capability is served by whatever tool exists on the user's machine (first
match wins); when a tool is missing, md2html says exactly what to install:

| Capability | Tools tried in order | If none found |
|---|---|---|
| markdown → HTML (**required**) | `pandoc` · `markdown-it` (npx cache) · `python3` markdown module | no output, exit ≠ 0, install suggestions printed |
| mermaid fence → PNG (optional) | `--mermaid-cmd` · `mmdc` · npx-cached `mmdc` | fence stays a code block + hint |
| local `.svg` → PNG (optional) | `rsvg-convert` · `inkscape` · `cairosvg` · `magick`/`convert` | SVG inlined as-is (Docs may not show it) + hint |

- Local images (and rendered diagrams) are inlined as base64 PNG — they survive the Docs paste.
- Remote images (`https://…`) pass through unchanged. No network calls; content never leaves the machine.
- PlantUML/graphviz fences stay code blocks.
- macOS only for the auto-open step (`open`); elsewhere, open the printed `.html` path manually.

## Agent duties

1. **Read stderr after every run.** Degradation flags and install hints land there
   (exit code stays 0 when HTML was produced). Surface them to the user and offer
   the install as a question — **never install anything silently**.
2. If the markdown engine itself is missing (exit ≠ 0), relay the printed
   candidates; `pandoc` is the recommended one (full GFM: tables, task lists, footnotes).
3. **Engine fidelity varies**: if the document uses task lists or footnotes and
   `pandoc` is absent, tell the user the output may lose those constructs and
   recommend `brew install pandoc`.
4. For UI mockups, author an `.svg` next to the markdown and reference it as an
   image (`![](./mockup.svg)`) — md2html rasterizes and inlines it in one pass.
   Keep the `.svg` source for later edits. Flow/architecture diagrams go in
   ```` ```mermaid ```` fences, rendered the same way (headless Chrome via `mmdc`
   — expect a few seconds per diagram).
