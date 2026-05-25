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
