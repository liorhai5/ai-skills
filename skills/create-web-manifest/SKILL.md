---
name: create-web-manifest
description: Give a web app a complete install identity — favicon set, PWA and home-screen icons, web app manifest, and the <head> meta that iOS, Android and link-preview crawlers read. Use when shipping or deploying a web app, or when the user mentions favicon, app icon, apple-touch-icon, web manifest, PWA, "add to home screen", install prompt, theme color, a stock scaffold title, or icons that look wrong, blurry, black, or cropped on a phone.
argument-hint: "[project-dir] [source-image]"
---

# create-web-manifest

One source mark in, a shippable install identity out: every icon size, a complete
`manifest.webmanifest`, and a `<head>` block — then an audit that proves it.

## Run

Determine this SKILL.md's own directory as `{baseDir}`. **Dry-run first, always:**

```bash
node "{baseDir}/create-web-manifest.mjs" <project-dir> --dry-run
```

It prints the framework it found, the mark it will use, the colours it inferred,
every file it would write, and **every tag it would remove from your HTML**. Show
that plan to the user and get approval before re-running without `--dry-run`.

Useful flags: `--source <file>` · `--name` · `--short-name` · `--description` ·
`--theme-color` / `--theme-color-dark` / `--bg-color` · `--start-url` · `--scope` ·
`--display` · `--site-url` (needed for absolute `og:image`) · `--og` (render a
1200×630 share image) · `--no-head` (assets only) · `--verify-only` (audit, change
nothing — exits non-zero on failures, so it works in CI).

## How it works — env tools, never bundled libraries

Rasterising is the only step that needs anything installed. Manifest, `<head>`,
the padded SVG derivatives, `.ico` assembly and the whole verify pass are pure
Node built-ins and always run.

| Capability | Tools tried in order | If none found |
|---|---|---|
| SVG source → PNG | `rsvg-convert` · `magick` · `inkscape` · `sharp` (npx cache) | manifest + `<head>` still written; PNG/ICO skipped, install hint printed |
| raster source → PNG | `magick` · `sharp` (npx cache) · `sips` (macOS) | same |
| padding a **raster** source | `magick` only | maskable + apple icons skipped, loud warning |
| flattening (removing alpha) | `magick` · `rsvg-convert` · `inkscape` | icon written **with** its alpha channel and a warning saying so — never silently |

An SVG source is materially better: padding is baked into a generated derivative
SVG, so every rasteriser yields a correct maskable icon.

## What it produces

`favicon.svg` · `favicon.ico` (16/32/48) · `favicon-96x96.png` ·
`apple-touch-icon.png` (180, **flattened onto a solid colour**) ·
`icon-192/512.png` (`purpose: any`, transparent) ·
`icon-maskable-192/512.png` (**separate files, mark inset to the central 80%**) ·
optional `og-image.png` (`--og`, **SVG source only** — a raster source is warned and skipped,
not silently promised) · the manifest · the `<head>` block.

Manifest covers `id`, `name`, `short_name`, `description`, `lang`, `dir`,
`start_url`, `scope`, `display`, `display_override`, `orientation`, `theme_color`,
`background_color`, `icons`, `categories`, `launch_handler`, and `screenshots`
(auto-picked up from `screenshot-*.png`, with `form_factor` from their aspect ratio).

Head covers title, description, canonical, light/dark `theme-color`, icon links,
`apple-touch-icon`, `apple-mobile-web-app-*`, `mobile-web-app-capable`,
`application-name`, `rel=manifest`, Open Graph and Twitter card.

Two rules it enforces that hand-written manifests routinely break:
a maskable icon is **never** the same file as an `any` icon (declaring one file
`"any maskable"` gets its edges cropped on Android), and `apple-touch-icon.png`
**never** carries transparency (iOS paints transparent pixels black). The verify pass
fails on both, and only excuses an alpha channel when the run actually flattened the icon —
not merely because it produced it.

## Agent duties

1. **Gate the write.** The tool rewrites `<head>`. It removes **only tags it re-emits**
   (plus stale icon rels) — an author's `og:locale`, `twitter:site`, `article:*` or a
   hand-set canonical are left alone. Run `--dry-run`, show the removal list, get approval.
   Re-runs are idempotent: the block sits between sentinel comments and is replaced.
   Before the first edit the original HTML is copied to `<file>.bak` and the path is
   reported — tell the user, since that is their undo if the project is not under git.
2. **Read stderr.** Degradation and install hints land there; exit stays 0 when
   the manifest was written. Surface them and offer the install **as a question** —
   never install anything silently.
3. **Make the judgment calls the script won't.** It infers `name` from
   package.json and `theme_color` from the project's own CSS, and says so in a
   `note`. Confirm with the user: a real `description` (it shows in the install
   dialog), a `short_name` ≤ 12 chars, and the right brand colour. Use
   `AskUserQuestion` when more than one reading is plausible.
4. **No mark? Author one first.** Write a 512×512 SVG to the project, then pass
   `--source`. It must be legible at 16px: one shape or 1–2 bold letters, no thin
   strokes, no fine detail, high contrast on both light and dark tab bars.
5. **Offer screenshots.** Without `screenshots[]` Chrome shows the plain install
   prompt instead of the rich card. Capturing 1 wide + 1 narrow PNG into the static
   dir as `screenshot-*.png` is usually worth it — re-run to pick them up.
6. **Frameworks that don't own an `index.html`** (Next, Nuxt, Astro, SvelteKit,
   Hugo, Jekyll) get `head-snippet.html` written to the static dir instead; merge
   it into that framework's head or metadata export yourself.
7. **Relay the verify block verbatim.** `FAIL` lines mean the app will not install
   or will display wrong — fix them before calling the task done.

See `references/manifest-spec.md` for field-by-field detail, the platform size
matrix, and the traps behind each enforced rule.
