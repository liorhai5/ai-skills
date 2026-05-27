import fs from "node:fs";
import path from "node:path";

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
export function isLocalImage(src) {
  return !/^(https?:)?\/\//i.test(src) && !/^data:/i.test(src);
}

// Resolve a local image reference to an existing absolute path. If the exact path
// is missing, try the same basename with common image extensions. Returns the
// absolute path, or null if nothing is found.
function resolveLocalPath(src, baseDir) {
  const decoded = decodeURIComponent(src.split(/[?#]/)[0]);
  const resolved = path.isAbsolute(decoded)
    ? decoded
    : path.resolve(baseDir, decoded);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return resolved;
  }
  const ext = path.extname(resolved);
  const base = ext ? resolved.slice(0, -ext.length) : resolved;
  for (const candidate of FALLBACK_EXTS) {
    const alt = `${base}${candidate}`;
    if (alt !== resolved && fs.existsSync(alt) && fs.statSync(alt).isFile()) {
      return alt;
    }
  }
  return null;
}

// Stateful inliner: tracks cumulative inlined bytes across one conversion so the
// total size guard can fire. Construct one per convert() call.
export function createImageInliner(baseDir) {
  let totalBytes = 0;

  return {
    // Given an <img> src, return a base64 data URI if it resolves to a local
    // file, or null to leave the src untouched (remote URLs, data URIs, and
    // unresolvable local paths).
    inline(src) {
      if (!isLocalImage(src)) return null;

      const abs = resolveLocalPath(src, baseDir);
      if (!abs) {
        console.error(`[md2html] image not found, left as-is: ${src}`);
        return null;
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
