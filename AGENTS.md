# ai-skills — agent guide

This repo hosts SKILL.md skills under `skills/<name>/`. For the human-facing
overview and skill list, see [README.md](README.md).

## Skill format (agentskills)

Each skill is a folder at `skills/<name>/` containing:

- `SKILL.md` with frontmatter: `name`, `description`, optional `argument-hint`
- Optional `references/`, `scripts/`, `assets/`

## Authoring conventions

- One skill per folder; folder name matches frontmatter `name`.
- `description` should state *when* to invoke the skill, not just *what* it does.
- Keep `SKILL.md` body terse — push details into `references/`.
- **No bundled libraries.** A skill's scripts use only language built-ins; anything
  more is served by tools detected on the user's machine (any capable tool, not one
  hard-wired library), with an install suggestion when none is found — never a
  silent install, never a `package.json`/`node_modules` inside a skill.
- Verification corpora live under `tests/<skill>/` at the repo root — they are for
  maintaining this repo and never ship with a skill.
