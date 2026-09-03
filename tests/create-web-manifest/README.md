# tests/create-web-manifest

Two corpora. Each states its own expectations; a change is correct when every
expectation below holds, not merely when the command exits zero.

## `fixture/` — the happy path

A Vite project with a stock scaffold `<title>`, a purple mark in
`public/logo.svg`, and `--brand-primary: #6d28d9` in its CSS.

```sh
node ../../skills/create-web-manifest/create-web-manifest.mjs fixture \
  --name "Orbit Notes" --short-name "Orbit" --site-url "https://orbit.example" --og
```

Expected:

1. Framework reported as `vite`, static dir `public` via *convention*.
2. Source auto-detected as `public/logo.svg` with no `--source` flag.
3. `theme_color` inferred as `#6d28d9`, attributed to the `--brand-primary`
   custom property **and** the source mark, with a `note` saying so.
4. `description` picked up from `package.json`.
5. Assets written: `favicon.svg`, `favicon.ico`, `favicon-96x96.png`,
   `apple-touch-icon.png`, `icon-192/512.png`, `icon-maskable-192/512.png`,
   `og-image.png`, `site.webmanifest`.
6. **Real dimensions match declared** — read the IHDR, do not trust filenames.
   `og-image.png` is **1200×630**, not square.
7. **`apple-touch-icon.png` and both maskable PNGs have colour type 0 or 2**
   (no alpha). `icon-192/512.png` have colour type 4 or 6 (alpha kept).
8. `icon-192.png` and `icon-maskable-192.png` are **different files**.
9. In `index.html`: `<meta charset>` stays the **first** element in `<head>`;
   the block is inserted after `<meta name="viewport">`; the scaffold `<title>`
   and the `/vite.svg` icon link are gone.
10. Verify reports `all checks passed`; exit code 0.
11. **Run it twice.** The second run leaves exactly one `create-web-manifest:start`,
    one `:end`, and one `<title>` — the block is replaced, never duplicated.

Reset before committing:

```sh
git checkout -- fixture/index.html && git clean -fd fixture/public
```

## `broken/` — the audit path

A manifest with one defect per check, run as `--verify-only`. Nothing is written.

```sh
node ../../skills/create-web-manifest/create-web-manifest.mjs broken --verify-only
```

Expected — **exit code 1**, and one `FAIL` for each of:

- `theme_color` is `rgb(1,2,3)`, not hex
- `start_url` `/app/` sits outside `scope` `/dashboard/`
- `icon-192.png` declares `"any maskable"` (the crop bug)
- `icon-512.png` declares `256x256` but the file is 512×512
- `icon-missing.png` does not resolve on disk
- no `any` icon ≥512 (the only 512 is mis-declared)
- one file listed as both `any` and `maskable`
- `<title>Vite + React</title>` is still a scaffold placeholder

Plus warnings for the 24-char `short_name`, missing `description`,
`background_color`, `apple-touch-icon.png`, and the four absent head tags.

Static dir must be reported as found **via `existing site.webmanifest`**, not by
Vite convention — the anchor rule that keeps assets where a project already put them.

## Graceful degradation

With no rasteriser on `PATH`, the manifest and `<head>` must still be written,
each missing tool must print its own install command on stderr, and the exit code
must reflect the verify result — not the missing tool.

```sh
env PATH=/usr/bin:/bin node ../../skills/create-web-manifest/create-web-manifest.mjs fixture
```

## `run-matrix.mjs` — the invariant matrix

Added after the invariants below were found to hold only under `rsvg-convert`, which merely
happened to be first on `PATH`. One rasteriser passing proves nothing about the others.

```sh
node tests/create-web-manifest/run-matrix.mjs
```

Runs the skill across **source type × rasteriser**, exposing exactly one tool per run via a
symlink shim with `PATH` set to that shim alone — `/usr/bin` must not be on it, or `sips` leaks
in and a row silently tests the wrong binary.

Each cell asserts:

1. `icon-maskable-192.png` exists and is **not byte-identical** to `icon-192.png`
2. `apple-touch-icon.png` and `icon-maskable-192.png` carry **no alpha channel**
3. `apple-touch-icon.png` is 180×180

Result vocabulary — a tool is never credited with a pass it did not earn:

| Result | Meaning |
|---|---|
| `pass` | invariants hold |
| `SKIP` | tool absent, or it cannot read that source type and the script said so |
| `DEGRADED` | tool cannot pad/flatten; the affected icons were skipped and a warning went to stderr |
| `FAIL` | an icon was produced that violates an invariant, or a capability was missing **without** a warning |

Exit code is non-zero only on `FAIL`. Expected on a machine with `rsvg-convert` + `magick`:
`svg×rsvg` and `svg×magick` and `png×magick` pass; `png×rsvg` and `svg×sips` skip;
`png×sips` degrades.

## Backup behaviour

First run on an HTML file must write `<file>.bak` holding the **pre-run** bytes:

```sh
grep -c 'create-web-manifest:start' fixture/index.html.bak   # 0
grep -c 'Vite + React'              fixture/index.html.bak   # 1
```

A second run must not overwrite it — the backup is the original, not the previous run's output.

## Tag preservation

A run must not destroy `<head>` tags it does not re-emit. Seed a file with `rel="canonical"`,
`og:locale`, `og:image:width` and `twitter:site`, run **without** `--site-url`, and all four must
survive. Before the 2026-09-03 fix, all four were deleted and none restored.
