// Strip a leading YAML frontmatter block ("---\n...\n---\n") from markdown source.
// Returns the body with the block removed. If no leading block is present, returns
// the input unchanged.
export function stripFrontmatter(source) {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    return source;
  }
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? source.slice(match[0].length) : source;
}
