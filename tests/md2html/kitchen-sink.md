---
title: Kitchen Sink
author: md2html
description: Exercises every construct md2html supports.
---

# Kitchen Sink

A fixture that exercises every supported construct. Run `md2html fixtures/kitchen-sink.md`
and paste the result into a Google Doc to verify formatting survives.

## Text formatting

This paragraph has **bold**, *italic*, ***bold italic***, ~~strikethrough~~, and
`inline code`. Here is an autolinked URL: https://example.com and an
[explicit link](https://www.google.com "Google").

## Lists

- Top level item
  - Nested item
    - Deeper nested item
- Another top level item

1. First
2. Second
   1. Second-A
   2. Second-B
3. Third

### Task list

- [x] Implement conversion
- [x] Inline local images
- [x] Render diagrams (mermaid + SVG)

## Table

| Feature        | Survives Docs paste? | Notes                       |
|----------------|----------------------|-----------------------------|
| Headings       | Yes                  | All levels                  |
| Tables         | Yes                  | Becomes a real Docs table   |
| Local images   | Yes                  | Inlined as base64           |
| Code blocks    | Yes                  | Color highlighting may drop |

## Blockquote

> The simplest solution that solves the problem wins.

## Code block

```js
function greet(name) {
  return `Hello, ${name}!`;
}
```

## Local image

![A generated gradient sample](./assets/sample.png)

## Remote image

![Wikipedia logo](https://upload.wikimedia.org/wikipedia/commons/8/80/Wikipedia-logo-v2.svg)

## Footnote

Markdown supports footnotes[^1] for citations.

[^1]: This is the footnote text.

## Local SVG (expected: rasterized to PNG when rsvg-convert is present)

![Sample SVG mockup](./assets/sample.svg)

## Mermaid (expected: rendered to a PNG when a renderer is present)

```mermaid
graph TD
  A[Markdown] --> B[md2html]
  B --> C[HTML]
  C --> D[Google Docs]
```

## Broken mermaid (expected: stays a code block, warning on stderr)

```mermaid
graph TD
  A[ -->
```

## PlantUML (control: always stays a code block)

```plantuml
@startuml
Alice -> Bob: hello
@enduml
```
