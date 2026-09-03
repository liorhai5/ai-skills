# References

Sources consulted while researching and building this skill.

**No third-party code or text is included.** Framework-to-static-directory mappings are factual
and were re-derived; all prose, all script code, and the manifest/head field sets are original.

## Skills.sh registry results

Queried `pwa`, `manifest`, `favicon` (2026-09-03), sorted by installs.

| Skill | Source | Installs | Used for |
|---|---|---|---|
| favicon-gen | jezweb/claude-skills | 2,088 | Inspected. Confirmed the iOS transparency trap and the 16px legibility rule as real constraints. Nothing copied. |
| favicon | brianlovin/agent-config | 1,797 | Inspected. Confirmed that framework detection and an existing-assets-wins rule are worth having. Nothing copied — see licence note below. |
| favicon-generator | kostja94/marketing-skills | 915 | Listed only; path not resolvable. |
| web-asset-generator | alonw0/web-asset-generator | 785 | Inspected. Its `specifications.md` corroborated the platform size matrix. Python/Pillow approach rejected — this repo forbids bundled libraries. |
| pwa-development | alinaqi/maggy | 3,051 | Listed; not inspected — PWA-wide scope, not icon/manifest specific. |
| progressive-web-app | secondsky/claude-skills | 422 | Listed; not inspected. |

## GitHub sources inspected

| File | Owner/Repo | Path | Quality | Notes |
|---|---|---|---|---|
| SKILL.md | jezweb/claude-skills | `plugins/design-assets/skills/favicon-gen/SKILL.md` | High | MIT. Strong asset craft; uses deprecated ImageMagick v6 `convert`; no framework detection. |
| manifest.webmanifest | jezweb/claude-skills | `.../favicon-gen/assets/manifest.webmanifest` | — | Includes `start_url`; declares icons `"any maskable"` on unpadded files. |
| SKILL.md | brianlovin/agent-config | `skills/favicon/SKILL.md` | High | **No LICENSE file — all rights reserved.** Read for evaluation only; nothing reused. Omits `start_url`; declares both icons `maskable` unpadded. |
| SKILL.md | alonw0/web-asset-generator | `skills/web-asset-generator/SKILL.md` | Medium | Scope wider than this task (OG/social focus). |
| specifications.md | alonw0/web-asset-generator | `.../references/specifications.md` | Medium | Platform size reference. |

## Why this skill exists

All three inspected skills declare icons `maskable` (or `any maskable`) on **unpadded** files.
Android crops a maskable icon to a safe zone of 80% diameter, so the mark loses its edges on the
home screen, and `"any maskable"` additionally puts that cropped art in the browser tab. One of
the three also omits `start_url` entirely, which fails Chromium's installability requirements.

This skill therefore treats two rules as hard failures in its verify pass:

1. A `maskable` icon is never the same file as an `any` icon.
2. `apple-touch-icon.png` never carries transparency — iOS composites on black.

## Local sources

| File | Path | Notes |
|---|---|---|
| AGENTS.md | repo root | Authoring conventions, incl. the no-bundled-libraries rule this skill is built around. |
| md2html SKILL.md | `skills/md2html/SKILL.md` | Precedent for the env-tool detection table, stderr install hints, and the Agent duties section. |
