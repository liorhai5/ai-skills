# ai-skills

A collection of [SKILL.md](https://github.com/anthropics/skills) skills for any agent runtime that loads the **agentskills** open format — Claude Code, Cursor, Codex, OpenCode, and others.

## Skills

| Skill | Purpose |
|---|---|
| [search-skill](skills/search-skill/) | Find, rate, refactor, or synthesize SKILL.md skills across GitHub and skill marketplaces |
| [optimize-skill](skills/optimize-skill/) | Optimize prompts, SKILL.md files, and AGENTS.md files — strengthen weak instructions into enforceable agent protocols |
| [research-codebase](skills/research-codebase/) | Investigate a codebase with system awareness — boundaries, control flows, blast radius, file:line citations |
| [design-critique](skills/design-critique/) | Review a UX spec, mockups, or UI for usability, case & state coverage, and completeness — heuristics/UX-laws/IA grounded, writes a verdict-first report |
| [md2html](skills/md2html/) | Convert a markdown file to self-contained HTML and open it in the browser for clean copy-paste into Google Docs — images inlined, mermaid fences and local SVGs rendered to PNG. A single dependency-free script (Node ≥ 18): every capability uses tools detected on your machine (pandoc / mmdc / rsvg-convert, …) and suggests installs when missing — nothing bundled |

## Install

Install via [`npx skills add`](https://www.npmjs.com/package/skills) (Vercel Labs):

```bash
# from GitHub
npx skills add https://github.com/liorhai5/ai-skills --skill <skill-name>

# from a local clone
npx skills add /path/to/ai-skills --skill <skill-name>
```

Where `<skill-name>` is `search-skill`, `optimize-skill`, `research-codebase`, `design-critique`, or `md2html`.

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
│   └── md2html/             # SKILL.md + one dependency-free md2html.mjs (env tools, nothing bundled)
└── tests/
    └── md2html/             # verification corpus (kitchen-sink.md + assets) — not part of the shipped skill
```

## For agent runtimes

See [AGENTS.md](AGENTS.md) — the entry point that agentskills-compatible runtimes discover automatically.
