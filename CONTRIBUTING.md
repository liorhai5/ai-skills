# Contributing

Thanks for taking a look. This repo holds SKILL.md skills in the
[agentskills](https://github.com/anthropics/skills) open format — see
[AGENTS.md](AGENTS.md) for the authoring conventions, which are the actual
rules a change is judged against.

## Adding or changing a skill

1. One skill per folder at `skills/<name>/`; the folder name must match the
   frontmatter `name`.
2. Write `description` to say **when** to invoke the skill, not just what it
   does — that sentence is what a runtime matches against.
3. Keep `SKILL.md` terse. Detail belongs in `references/`.
4. **No bundled libraries.** Scripts use language built-ins only; anything
   heavier is served by a tool detected on the user's machine, with an install
   hint when it is missing. No `package.json` or `node_modules` inside a skill.

## Verifying a change

Skills with a script carry a corpus under `tests/<skill>/` at the repo root.
These are for maintaining this repo and never ship with the skill.

```sh
node skills/md2html/md2html.mjs tests/md2html/kitchen-sink.md --no-open
```

`kitchen-sink.md` states its own expectations in its headings — including the
cases that are *meant* to degrade, such as the deliberately broken mermaid
fence. A change is correct when every section behaves as its heading says,
not merely when the command exits zero.

## Pull requests

Keep them to one concern. Say what you changed and how you verified it. If a
capability depends on an external tool, note which tools you tested with and
what the output is when none is present — graceful degradation is a feature
here, not an afterthought.
