# ai-skills

A collection of [SKILL.md](https://github.com/anthropics/skills) skills for any agent runtime that loads the **agentskills** open format — Claude Code, Cursor, Codex, OpenCode, and others.

## Skills

| Skill | Purpose |
|---|---|
| [search-skill](skills/search-skill/) | Find, rate, refactor, or synthesize SKILL.md skills across GitHub and skill marketplaces |
| [optimize-skill](skills/optimize-skill/) | Optimize prompts, SKILL.md files, and AGENTS.md files — strengthen weak instructions into enforceable agent protocols |
| [research-codebase](skills/research-codebase/) | Investigate a codebase with system awareness — boundaries, control flows, blast radius, file:line citations |
| [design-critique](skills/design-critique/) | Review a UX spec, mockups, or UI for usability, case & state coverage, and completeness — heuristics/UX-laws/IA grounded, writes a verdict-first report |
| [create-web-manifest](skills/create-web-manifest/) | Give a web app a complete install identity — favicon set, PWA/home-screen icons, web app manifest and `<head>` meta from one source mark, then audit the result. Enforces the two rules hand-written manifests break: a maskable icon is a separate padded file, and `apple-touch-icon.png` carries no transparency. Rasterising uses tools detected on your machine (rsvg-convert / magick / inkscape / sharp); manifest, head, `.ico` assembly and the verify pass are pure Node built-ins |
| [md2html](skills/md2html/) | Convert a markdown file to self-contained HTML and open it in the browser for clean copy-paste into Google Docs — local images inlined as base64, mermaid fences and local SVGs rendered to PNG (remote image URLs are left as references; auto-open is macOS-only). A single dependency-free script (Node ≥ 18): every capability uses tools detected on your machine (pandoc / mmdc / rsvg-convert, …) and suggests installs when missing — nothing bundled |

## Install

Install via [`npx skills add`](https://www.npmjs.com/package/skills) (Vercel Labs):

```bash
# from GitHub
npx skills add https://github.com/liorhai5/ai-skills --skill <skill-name>

# from a local clone
npx skills add /path/to/ai-skills --skill <skill-name>
```

Where `<skill-name>` is `search-skill`, `optimize-skill`, `research-codebase`, `design-critique`, `create-web-manifest`, or `md2html`.

To target a specific agent (or install into multiple), pass `--agent <agent>` (`claude`, `cursor`, `codex`, `opencode`, …). See `npx skills add --help`.

## Skill format

Skills follow the **SKILL.md (agentskills) open format**:

- One folder per skill at `skills/<name>/`
- `SKILL.md` with frontmatter (`name`, `description`, optional `argument-hint`)
- Optional `references/`, `scripts/`, `assets/`

## Repo layout

```
ai-skills/
├── README.md                 # this file (humans)
├── AGENTS.md                 # agent-runtime entry
├── skills/
│   ├── search-skill/
│   ├── optimize-skill/
│   ├── research-codebase/
│   ├── design-critique/     # references/ + templates/ + examples/, no scripts
│   ├── create-web-manifest/ # SKILL.md + references/ + create-web-manifest.mjs (env tools for rasterising only)
│   └── md2html/             # SKILL.md + one dependency-free md2html.mjs (env tools, nothing bundled)
└── tests/
    ├── create-web-manifest/ # verification corpora (fixture/ happy path + broken/ audit) — not shipped
    └── md2html/             # verification corpus (kitchen-sink.md + assets) — not part of the shipped skill
```

## For agent runtimes

See [AGENTS.md](AGENTS.md) — the entry point that agentskills-compatible runtimes discover automatically.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE) © Lior Hai
