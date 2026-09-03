# Web app manifest & head meta — field reference

## Installability floor

Chromium refuses to offer installation unless *all* of these hold. Each is a
`FAIL` in the verify pass.

- manifest served with a `<link rel="manifest">` and parseable as JSON
- `name` (or `short_name`)
- `start_url`, and it must resolve inside `scope`
- `display` is one of `standalone`, `fullscreen`, `minimal-ui`
- an icon with `purpose` including `any` at **≥192×192**
- an icon with `purpose` including `any` at **≥512×512**
- served over HTTPS (localhost exempted)

Safari/iOS ignores most of the manifest for home-screen installs and reads
`apple-touch-icon` plus the `apple-mobile-web-app-*` meta tags instead. Both
surfaces must be satisfied; neither is a superset of the other.

## Fields

| Field | Why it matters |
|---|---|
| `id` | Stable identity. Without it the app's identity *is* `start_url`, so changing that URL later orphans the installed app and creates a second one. Set once, never change. |
| `name` | Install dialog, app list. Full product name. |
| `short_name` | Home screen / launcher label. **≤12 chars** — beyond that iOS and Android truncate with an ellipsis. |
| `description` | Shown in Chrome's install dialog. Absent = a blank, less trustworthy prompt. |
| `start_url` | What launching the icon opens. Add a query param (`?source=pwa`) if you want to measure installs. |
| `scope` | URLs that stay inside the app window. Navigation outside it opens a browser tab. Must contain `start_url`. |
| `display` | `standalone` for app-like; `minimal-ui` keeps a slim URL bar; `fullscreen` for games. |
| `display_override` | Ordered fallback list, evaluated before `display`. Where `window-controls-overlay` or `tabbed` goes. |
| `orientation` | Only lock it if the app genuinely breaks rotated. |
| `theme_color` | Colours the Android status bar and desktop titlebar. Must be hex — `rgb()` and named colours are rejected. |
| `background_color` | Painted on the splash screen *before* CSS loads. Match your real page background or launches flash. |
| `icons` | See below. |
| `screenshots` | Unlocks Chrome's rich install dialog. Needs `sizes`, `type`, and `form_factor` (`wide` = desktop, `narrow` = mobile). Supply at least one of each. |
| `categories` | Store/launcher grouping, e.g. `["productivity","utilities"]`. Lowercase. |
| `lang` / `dir` | BCP-47 tag and `ltr`/`rtl`. Affects how `name` renders in the launcher. |
| `launch_handler` | `client_mode: "navigate-existing"` focuses the open window instead of spawning another. |
| `shortcuts` | Long-press / right-click jump list. Each needs `name`, `url`, and its own `icons`. |

## Icons

| File | Size | Alpha | Purpose |
|---|---|---|---|
| `favicon.svg` | vector | yes | Modern tabs; scales everywhere |
| `favicon.ico` | 16/32/48 | yes | Legacy tabs, bookmarks, Windows |
| `favicon-96x96.png` | 96 | yes | Fallback where SVG is unsupported |
| `apple-touch-icon.png` | 180 | **no** | iOS home screen |
| `icon-192.png` | 192 | yes | Android, `purpose: any` |
| `icon-512.png` | 512 | yes | Splash + install dialog, `purpose: any` |
| `icon-maskable-192.png` | 192 | no | Android adaptive, `purpose: maskable` |
| `icon-maskable-512.png` | 512 | no | Android adaptive, `purpose: maskable` |

### The two traps

**`"purpose": "any maskable"` on one file is wrong.** Android crops a maskable
icon to a shape whose safe zone is the central circle of 80% diameter; the outer
~20% is decoration that may be cut. An `any` icon is drawn uncropped. One file
cannot be both: mark it maskable and Android eats its edges, or the same cropped
art shows in the browser tab. Ship **two files** — the plain mark as `any`, and a
copy inset to the central 80% on a filled background as `maskable`.

**Transparency in `apple-touch-icon.png` renders black.** iOS composites the
home-screen icon on black, not white, so any alpha becomes a dark halo or a solid
black tile. Flatten it onto a real colour and let iOS apply its own corner mask —
do not pre-round the corners.

## Head tags

```html
<link rel="icon" href="/favicon.ico" sizes="48x48" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#6d28d9" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#1a1030" media="(prefers-color-scheme: dark)" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Orbit" />
```

- `apple-mobile-web-app-title` is what iOS puts under the icon — it does **not**
  read `short_name`. Omit it and iOS uses `<title>`, which is usually too long.
- `black-translucent` lets content run under the status bar; you must then pad for
  the safe area yourself (`env(safe-area-inset-top)`). Use `default` if you'd rather not.
- `mobile-web-app-capable` is the standard tag; the `apple-` one is still required
  by older iOS. Ship both.
- `<meta charset>` must stay within the first 1024 bytes of the document — never
  push it below the icon block.
- Open Graph `og:image` must be an **absolute** URL; relative paths are ignored by
  most crawlers. 1200×630 is the safe size across Facebook, LinkedIn, WhatsApp and
  Slack. `twitter:card` should be `summary_large_image` only when a real wide image
  exists — otherwise `summary`.

## Verifying by hand

- Chrome DevTools → Application → Manifest: shows parsed fields, icon previews,
  and the exact installability blocker if there is one.
- Maskable preview: same panel has a "maskable" toggle per icon.
- iOS cannot be checked in a simulator reliably — add to home screen on a device.
- Link previews: paste the URL into a Slack DM to yourself.
