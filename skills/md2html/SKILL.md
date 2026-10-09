---
name: md2html
description: Convert a local markdown file to self-contained HTML for rich-text copy-paste into Google Docs. Use when the user asks to "turn this markdown into a Google Doc", "paste this md into Docs", or "convert md to html for pasting".
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

## Default document style

The reference style uses locally installed Wix Madefor Display (including the
corporate App faces), with Madefor Text then Arial/sans-serif fallback.
No fonts are downloaded, embedded or installed;
the HTML's typography can differ on a machine without Madefor.

Body, lists, blockquotes and table cells use 12pt text with 1.15 line spacing.
A leading H1 is a 26pt title. H1–H4 use 18/14/12/12pt, distinguished by regular,
underlined, bold and bold-italic styles. Tables have light grids, pale headers and
16pt vertical/9pt horizontal cell padding, with no extra cell-paragraph margins.
Section separators leave space without divider lines.

Use the Markdown as written: no special note labels, status vocabulary or HTML
classes are required. Quotes are neutral; existing status text/icons and diagram
colors/settings are preserved. Existing ✓/⚠/✕ symbols use green/amber/red; code stays literal.
Do not re-theme or re-layout diagrams for the style.
Temporary renders are removed after embedding; there is no persistent diagram cache.

Use ordinary rich paste (⌘V). Check font, spacing, tables and images in the pasted
document when exact appearance matters; HTML appearance does not prove Docs paste
fidelity or linkage to its named styles. The skill supplies its own house style.

Select-all/copy automatically prepares rich HTML with 755px-wide tables and the
same cap for large images, matching the accepted pageless reference. Smaller
images retain their natural size. This width does not automatically follow a
different target's page margins or a viewer's pageless text-width setting.
Copy includes explicit text styles and excludes CSS-hidden content, without an
extra button or step. Partial selections use normal browser copying;
unavailable copy handling falls back to it.

## How it works — env tools, never bundled libraries

Every capability is served by whatever tool exists on the user's machine (first
match wins); when a tool is missing, md2html says exactly what to install:

| Capability | Tools tried in order | If none found |
|---|---|---|
| markdown → HTML (**required**) | `pandoc` · `markdown-it` (npx cache) · `python3` markdown module | no output, exit ≠ 0, install suggestions printed |
| mermaid fence → PNG (optional) | `--mermaid-cmd` · `mmdc` · npx-cached `mmdc` | fence stays a code block + hint |
| local `.svg` → PNG (optional) | `rsvg-convert` · `inkscape` · `cairosvg` · `magick`/`convert` | SVG inlined as-is (Docs may not show it) + hint |

- Local images are inlined as base64 data URIs; rendered diagrams use PNG for Docs paste.
- Remote images (`https://…`) pass through unchanged and may be fetched by the browser when viewed. Conversion and font resolution add no network requests.
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

Updates affect this skill folder. If an agent uses a copied installation, refresh
that copy after updating the repository; a linked installation follows its target.
