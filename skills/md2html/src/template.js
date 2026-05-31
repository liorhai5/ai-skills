// Minimal, readable styling for browser viewing. Google Docs discards almost all
// of this on paste — it's here so the intermediate HTML is pleasant to look at and
// select. Keep it lean.
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
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Wrap rendered body HTML in a complete, self-contained HTML document.
export function wrapDocument(bodyHtml, title) {
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
