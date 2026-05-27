---
name: md2html
description: Convert a local markdown file to a self-contained HTML file and open it in the browser, so it can be copy-pasted into Google Docs with formatting and images intact. Use when the user asks to "turn this markdown into a Google Doc", "paste this md into Docs", or "convert md to html for pasting".
argument-hint: "<path-to-markdown-file>"
---

# md2html

Convert the markdown file given in `$ARGUMENTS` to HTML and open it in the browser.
The user then selects-all (⌘A), copies (⌘C), and pastes (⌘V) into Google Docs.

## Run

The skill ships a self-contained bundle at `scripts/md2html.mjs` (no install step).
Determine this SKILL.md's own directory as `{baseDir}`, then run:

```bash
node "{baseDir}/scripts/md2html.mjs" "$ARGUMENTS"
```

Requires Node ≥ 18 on `PATH`. To convert without opening the browser, append `--no-open`.

## Behavior

- Writes `<file>.html` next to the input (overwriting any existing one) and opens it.
- Local images are inlined as base64, so they survive the paste into Docs.
- Remote images (`https://…`) are passed through unchanged.
- Mermaid/PlantUML fences render as code blocks (diagram rendering is not included).
- macOS only for the auto-open step (`open`); elsewhere, open the printed `.html` path manually.
