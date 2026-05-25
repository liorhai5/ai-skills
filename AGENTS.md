# ai-skills

A collection of SKILL.md skills for use with any agent runtime that loads the
agentskills open format (Claude Code, Cursor, Codex, OpenCode, and others).

## Hosted skills

| Skill | Purpose |
|---|---|
| [search-skill](skills/search-skill/) | Find, rate, refactor, or synthesize SKILL.md skills across GitHub and skill marketplaces |
| [optimize-skill](skills/optimize-skill/) | Optimize prompts, SKILL.md files, and AGENTS.md files — strengthen weak instructions into enforceable agent protocols |
| [research-codebase](skills/research-codebase/) | Investigate a codebase with system awareness — boundaries, control flows, blast radius, file:line citations |

## Installation

Install via `npx skills add` (Vercel Labs):

```bash
# from GitHub
npx skills add https://github.com/<owner>/ai-skills --skill <skill-name>

# from a local clone
npx skills add /path/to/ai-skills --skill <skill-name>
```

Where `<skill-name>` is `search-skill`, `optimize-skill`, `research-codebase`, or any other skill folder under `skills/`.

To target a specific agent or install into multiple, pass `--agent <agent>`
(`claude`, `cursor`, `codex`, `opencode`, …). See `npx skills add --help`.

## Skill format

Skills follow the **SKILL.md (agentskills) open format**:

- One folder per skill at `skills/<name>/`
- `SKILL.md` with frontmatter (`name`, `description`, optional `argument-hint`)
- Optional `references/`, `scripts/`, `assets/`

## Repo layout

```
ai-skills/
├── AGENTS.md                # this file
├── .gitignore
└── skills/
    ├── search-skill/
    ├── optimize-skill/
    └── research-codebase/
```

Design notes for skill evolution live under `.ai/` (gitignored — personal working files).
