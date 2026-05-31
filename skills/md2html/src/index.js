import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";

import { stripFrontmatter } from "./frontmatter.js";
import { createImageInliner } from "./images.js";
import { wrapDocument } from "./template.js";

function buildRenderer() {
  return new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  })
    .use(footnote)
    .use(taskLists);
}

// Pull a document title from the first ATX heading, if any.
function firstHeading(markdown) {
  const match = markdown.match(/^#{1,6}\s+(.+?)\s*#*\s*$/m);
  return match ? match[1].trim() : null;
}

// Rewrite local <img src="..."> to base64 data URIs. markdown-it emits
// double-quoted attributes, and a data URI never contains a double quote, so a
// targeted string replace within each tag is safe and keeps us cheerio-free.
function inlineImages(html, inliner) {
  return html.replace(/<img\b[^>]*>/g, (tag) => {
    const m = tag.match(/\ssrc="([^"]*)"/);
    if (!m) return tag;
    const dataUri = inliner.inline(m[1]);
    return dataUri ? tag.replace(m[0], ` src="${dataUri}"`) : tag;
  });
}

// Convert markdown source to a complete, self-contained HTML document string.
// Synchronous: local images are read with sync I/O; remote images are left as-is
// (no network). `baseDir` resolves relative local image paths. `title` overrides
// the document title (defaults to the first heading, then "document").
export function convert(mdSource, { baseDir, title } = {}) {
  const body = stripFrontmatter(mdSource);
  const md = buildRenderer();
  const rendered = md.render(body);

  const inliner = createImageInliner(baseDir ?? process.cwd());
  const withImages = inlineImages(rendered, inliner);

  const docTitle = title || firstHeading(body) || "document";
  return wrapDocument(withImages, docTitle);
}
