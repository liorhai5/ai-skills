---
name: search-skill
description: Use when the user asks to find, evaluate, rate, refactor, or synthesize Agent Skills (the SKILL.md folder format) across GitHub and skill marketplaces. Covers searching for a skill for a task, deep-diving a candidate, rating an existing SKILL.md, refactoring a skill, fetching a remote skill for inspection, or creating a new local skill from researched patterns. Do NOT activate for general package search (npm, PyPI, cargo), web search, or code research not involving SKILL.md files.
argument-hint: "find topic | rate path | improve path | synthesize name"
---

# search-skill

Find, evaluate, audit, or synthesize Agent Skills by inspecting real skill files, comparing workflow quality, and gating every write action.

Agent Skills are folders with required `SKILL.md` frontmatter (`name`, `description`) plus instructions. They may include `scripts/`, `references/`, `assets/`, or other support files. Agents load them by progressive disclosure: metadata first, full `SKILL.md` on activation, bundled resources only when needed.

## Tools

Built-in: Read, Edit, Write, WebFetch
Shell:    Bash with `gh` (GitHub CLI — run `gh auth login` if not authenticated) and `curl`

## Operating Model

Default flow:

```text
UNDERSTAND -> DISCOVER -> INSPECT -> JUDGE -> RECOMMEND -> USER GATE -> ACT -> VERIFY
```

Compress steps when the user names a specific source (`owner/repo path-to-SKILL.md` or a local path). Repeat steps when discovery returns weak or conflicting candidates.

Hard rules:

Recommend
- MUST recommend by task fit, workflow quality, safety gates, and portability; use `installs` count or GitHub stars only as a tiebreaker when two candidates are otherwise equal.
- MUST identify every remote candidate by `(owner/repo, path-to-SKILL.md)` and every local candidate by absolute or workspace-relative path.

Inspect
- MUST inspect actual `SKILL.md` content before recommending, adapting, or quoting a candidate as a pattern.
- MUST inspect referenced files that affect behavior for strong, risky, or unclear candidates.
- MUST skip candidates lacking valid `name` and `description` frontmatter.

Gate
- MUST gate file writes, local skill creation, and overwrite decisions.

Forbidden
- FORBIDDEN: handing the user a raw search dump to rank. Filter first, explain tradeoffs, recommend a next step.
- FORBIDDEN: copying another skill wholesale unless the license and the user explicitly allow it.

Stop when any of these is true:

- One recommendation is justified by inspected content.
- Two or more High-quality candidates have been inspected and task fit is confirmed for the top pick.
- Three search angles have returned no new candidates not already examined.
- A user gate is awaiting an answer.

## Tool Routing

Lead local when the question is about the user's workspace; lead GitHub when shopping for a skill.

- Read local files: `Read` tool on absolute paths.
- Read remote `SKILL.md` content: `Bash` with `gh api repos/<owner>/<repo>/contents/<path>` — decode `content` field (base64) — or use `WebFetch` on the raw GitHub URL `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>`.
- Search GitHub code: `Bash` with `gh search code 'filename:SKILL.md <terms>'` or `gh api search/code?q=<query>`.
- Search GitHub repos: `Bash` with `gh search repos --topic <topic>` or `gh api search/repositories?q=<query>`.
- Marketplace registries: `Bash` with `curl` (no auth needed for skills.sh, agentskills.io, etc.).

Fallbacks:
- IF `gh` is not authenticated → prompt the user to run `gh auth login` before continuing.
- IF a marketplace surface (`skills.sh`, `claude-plugins.dev`, `aiskillstore.io`, `agentskills.me`) is unreachable or rate-limited, switch to GitHub topic search and `llms.txt` catalog snapshots (see `references/discovery-surfaces.md`); lower confidence and continue.
- IF the user requested local-only work, do not query remote sources.

### Fetching a remote skill for inspection

Use `Bash` with `gh repo clone <owner>/<repo> /tmp/<scratch>` (or `git clone` to any scratch path).
Read `<scratch>/<path>/SKILL.md` — confirm `name` and `description` frontmatter.
Flag any `scripts/` or install hooks to the user before adapting.

## Local References

All reference material lives under `references/`.

- Read `references/agent-skills-guide.md` when evaluating, improving, rating, or creating a skill, optimizing a description, deciding what belongs in `SKILL.md`, designing progressive references, or adding scripts/assets.
- Read `references/discovery-surfaces.md` when the user wants to shop for skills beyond raw GitHub search — marketplaces, leaderboards, registry REST APIs, manifest formats, and CLI installers.
- Read `references/references-template.md` when synthesizing a new local skill and need to scaffold its audit trail.

## Understand

Extract these facts before searching or editing:

- User goal: find, compare, audit, rate, refactor, fetch, or synthesize.
- Task/domain: coding, docs, data, design, security, research, planning, review, operations, or other.
- Target ecosystem: Claude Code, Claude Desktop, Cursor, Codex, OpenCode, custom agent, or unspecified.
- Source scope: local folders, named repo, marketplace, broad public search, or user-provided skill path.
- Constraints: language, framework, IDE, license, local-only, security posture, no-web, org/repo limits.
- Quality preference: battle-tested, small, script-backed, enterprise-safe, example-rich, low-dependency, or strict-gated.

Ask one focused question only when the answer changes search scope, target ecosystem, or write behavior. Otherwise proceed with stated assumptions.

## Discover And Inspect

Set depth before searching:

- Quick answer: inspect enough to recommend one best candidate with caveats.
- Research request: compare broadly, preserve confirmed sources, stop when more search is unlikely to change the recommendation.
- Audit, rate, or refactor request: inspect the target skill, adjacent local examples, and `references/agent-skills-guide.md` before writing.
- Synthesize request: inspect the strongest candidates fully before drafting.
- Weak results: broaden once, then report the gap and the next best action.

Search angles:

- Name: exact phrase, lowercase, hyphenated folder name, aliases.
- Subject: core domain terms.
- Workflow verbs: analyze, review, migrate, generate, optimize, debug, audit, benchmark, plan.
- Ecosystem: agent, IDE, language, framework, MCP server, CLI, or platform named by the user.
- Safety: gate, validation, rollback, verify, tests, prompt, scripts, permissions.

Useful GitHub patterns (with `gh search code` or `gh api search/code`):

- Search body and frontmatter: `filename:SKILL.md <terms>`.
- Search likely folder names: `path:**/<name>/SKILL.md`.
- Search composite filenames: `filename:*.skill.md`.
- Search frontmatter content: `filename:SKILL.md "name:" "description:"` to bias toward well-formatted skills.
- Discover repos via topics: `gh search repos --topic agent-skills`, `--topic claude-code-skills`, `--topic claude-skill`, `--topic cursor-skills`, `--topic codex-skills`.
- Inspect likely paths: `skills/<name>/SKILL.md`, `skills/<category>/<name>/SKILL.md`, `<name>/SKILL.md`, `.claude/skills/<name>/SKILL.md`, `.cursor/skills/<name>/SKILL.md`, `.codex/skills/<name>/SKILL.md`, `.opencode/skills/<name>/SKILL.md`, `.agents/skills/<name>/SKILL.md`.
- Probe plugin manifests: `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, and per-catalog `llms.txt` / `llms-full.txt` files for batch discovery.

### Skills.sh Registry API

MUST run this in parallel with GitHub search for every public skill query.

```bash
curl 'https://www.skills.sh/api/search?q={{SEARCH_KEY}}&limit=100' \
  --compressed \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:150.0) Gecko/20100101 Firefox/150.0'
```

Response shape: `{"skills": [{"id": string, "skillId": string, "name": string, "installs": number, "source": "owner/repo"}, ...], "count": number}`

Popularity workflow — MUST follow this order:

1. Sort results by `installs` descending — highest install count = most battle-tested signal.
2. Take the top 5 candidates by installs as priority inspection targets.
3. In parallel with other searches, fetch each top candidate's `SKILL.md` via `gh api repos/<owner>/<repo>/contents/<path>` (try paths `skills/<skillId>/SKILL.md`, `<skillId>/SKILL.md`, `.claude/skills/<skillId>/SKILL.md`).
4. Include install count in every result card as a quality signal.
5. MUST NOT blindly recommend the highest-install skill — inspect content and task fit first; use `installs` as a tiebreaker only when two candidates are otherwise equal.

Fallback: if the API is unreachable or rate-limited, switch to `https://www.skills.sh` leaderboard page and GitHub topic search; lower confidence and continue.

Marketplace and registry surfaces (see `references/discovery-surfaces.md` for the full list and APIs):

- Per-skill check: `https://www.skills.sh/<owner>/<repo>/<skill-name>` — install count, install command, security audit status.
- Leaderboard: `https://www.skills.sh` — install-count ranked, agent-filtered.
- Additional registries: `agentskills.io/llms.txt`, `aiskillstore.io/llms.txt`, `microsoft.github.io/skills/llms-full.txt`; `claude-plugins.dev` REST for Claude Code plugin search.

Seed only when discovery is sparse. Start from `topic:agent-skills` (or the narrower `topic:claude-code-skills`) on GitHub, then sample well-maintained collections such as `anthropics/skills`, `ComposioHQ/awesome-claude-skills`, `addyosmani/agent-skills`, `vercel-labs/skills`, `alirezarezvani/claude-skills`, `microsoft/skills`, `obra/superpowers`, `trailofbits/skills`, `wshobson/claude-code-workflows`, or any author-curated marketplace the user trusts.

## Judge Quality

For every plausible candidate, inspect enough `SKILL.md` content to understand behavior. For strong, risky, or ambiguous candidates, inspect full `SKILL.md` plus referenced scripts, templates, evals, or reference files that affect execution.

Evaluate:

- Trigger: clear activation conditions and non-activation boundaries.
- Workflow: ordered steps, decision points, recovery paths, and stop conditions.
- Evidence: real file contents, referenced resources, tests, examples, or scripts.
- Gates: validation, approval, preview, review, permissions, rollback.
- Output UX: concise results, useful comparison cards, explicit next-step gate.
- Specificity: domain knowledge an agent would not know by default.
- Portability: agent/runtime assumptions, hardcoded paths, external services, dependencies, secrets.
- Risk: unsafe commands, hidden network actions, missing referenced files, license ambiguity, stale docs, broad triggers.

Quality labels:

- `High`: direct match, clear trigger, executable workflow, useful resources and gates, and no obvious safety or portability red flags.
- `Medium`: partial match or adaptable, but missing some validation, UX, or domain detail.
- `Low`: keyword-only match, generic workflow, unclear trigger, stale pattern, or meaningful caveat.

For evidence-based quality signals beyond stars (install counts, recency, audit badges, capability overlap, demand signals), load `references/agent-skills-guide.md` §Quality Signals Beyond Stars and `references/discovery-surfaces.md` §Quality Signals Beyond Stars.

## Self-Improvement Mode

Use this mode when the user asks to rate, review, score, audit, or refactor a `SKILL.md` — yours or someone else's. Read `references/agent-skills-guide.md` before rating or rewriting.

The skill has two invocation modes for self-improvement:

| Mode | Invocation | Behavior |
|------|------------|----------|
| **Rate** | `/search-skill rate <path>` | Read → Map intent → Rate → write report → stop. **Does NOT modify** the target `SKILL.md`. |
| **Improve** | `/search-skill improve <path>` | Read → Map intent → Rate → Rewrite → Validate → write report → **ask user to approve** → update the target file in-place after approval. |

`improve` covers both "Improve / refactor / rewrite" and "Fix all" (apply prior fixes from this conversation) — the skill detects whether a prior rating exists and skips re-rating when it does.

### Output convention

Outputs are consistent across both modes:

| Artifact | Path | Always Written? |
|----------|------|-----------------|
| **Report** | `.ai/search-skill/<NNN>-<topic>/report.md` | **Yes** — every invocation, both modes |
| **Updated target file** | The original `<path>` (in-place) | **Only in `improve` mode after user approval** |

**Topic naming:** derive `<topic>` from the target skill's `name` frontmatter (e.g., target `~/.agents/skills/mtg/SKILL.md` with `name: mtg` → topic `mtg`). Use the next available `NNN` by scanning `.ai/search-skill/`.

**Report structure (always the same):**

```markdown
# Search-Skill Self-Improvement Report — <topic>

**Target:** <absolute path>
**Mode:** rate | improve
**Date:** <YYYY-MM-DD>

## Overall
<score>/10 — <letter grade> (one-sentence summary).

## Score Card
Per-dimension High/Medium/Low using §Judge Quality (Trigger, Workflow, Evidence, Gates, Output UX, Specificity, Portability, Risk).

## Intent Preserved
Core job, trigger domain, user-facing promises that must not change.

## Issues Found
| Section | Issue | Severity | Fix |
|---------|-------|----------|-----|
| <name> | <description> | Critical/High/Medium/Low | <what to do> |

## Validation
Pass/fail per checklist item (frontmatter valid, workflow clear, references resolve, MUST/FORBIDDEN where needed, no bypass writes).

## Proposed Rewrite
[Improve mode only — the specific text changes proposed. Empty in rate mode.]

## Strengths
2–4 bullets worth preserving.

## Residual Risk
1–3 bullets.

## Changes Applied
[Empty in rate mode. In improve mode after approval: list of diffs applied to target.]
```

**Improve mode approval gate:**
After producing the report (sections up to "Changes Applied"), display the report to the user and prompt:
```
Apply these changes to <path>? [Y/n]
```
On Y: update `<path>` in-place; append "Changes Applied" section with the diff summary.
On n: leave `<path>` untouched; mark report status "rate-only (user declined fixes)".

### Flow

```text
READ -> MAP INTENT -> RATE ISSUES -> [REWRITE -> VALIDATE] -> REPORT
```

Read:

- Read the full target `SKILL.md` and all referenced files that affect behavior.
- Note purpose, line count, resources, gates, and output format.

Map intent:

- Preserve the skill's core job, trigger domain, and user-facing promises.
- Identify what behavior must become more reliable: activation, research quality, safety gates, tool routing, output shape, or recovery.

Rate issues:

- Check for weak rules in critical sections, vague actions, raw-search handoff, missing gates, unsafe writes, missing verification, stale references, and line-count bloat.
- Group findings by severity: `Critical`, `High`, `Medium`, `Low`. Cite `file:line` for each.
- Score per dimension using the §Judge Quality rubric (`High` / `Medium` / `Low`).

Rewrite (improve mode only — skip in rate mode):

- Fix Critical and High issues first.
- Keep `SKILL.md` concise; target 300 lines or less unless the domain justifies more.
- Move long examples, schemas, or static references into `references/` only when that reduces active-context load.
- Keep `description` trigger-rich without keyword stuffing.

Validate (improve mode only — skip in rate mode):

- Frontmatter has valid `name` and `description`.
- Workflow has clear steps, gates, recovery, and output UX.
- Referenced files exist or missing files are documented as risks.
- Critical actions use MUST/NEVER/FORBIDDEN where needed.
- No write action bypasses an explicit user gate.

Report:

- Write the report file per the Output Convention above.
- In rate mode: terminate after the report.
- In improve mode: present the approval gate; on approval, apply changes and append the "Changes Applied" section.

## Present Results

Lead with the recommendation in one sentence. Then group results only when useful:

- `Best matches`
- `Useful alternatives`
- `Explore if...`

If results are few, show compact cards. If results are many, list confirmed names and sources compactly and provide detailed cards only for the strongest candidates.

Card shape (label layout, not literal Markdown):

```text
Name:            <skill-name>  - fit: High | Medium | Low
Source:          <owner/repo path-to-SKILL.md> or <local path>
What it does:    <one sentence in your own words>
Actual flow:     <2-4 short steps from inspected content>
Quality signals: <specific evidence>
Why it matches:  <tie to user's request>
Caveat:          <real risk, or "None obvious from inspected files">
```

Keep prose short. Do not paste raw search dumps or large excerpts.

End with a user gate that offers the real next branches. Use a structured ask tool when the runtime provides one; otherwise present concise numbered choices and wait.

Gate example:

```text
Recommended: <skill-name> from <source>

Choose:
1. Fetch — clone the source repo to a scratch path so we can inspect or adapt the skill locally.
2. Create a local skill — adapt patterns from this candidate into a new local SKILL.md.
3. Explain — break down trigger, workflow, gates, and risks.
4. Show link — return the source URL or local path only, no write.
5. Compare — line up against another candidate.
6. Keep researching.
7. Cancel.
```

## Deep-Dive

When the user picks a skill:

1. Fetch full `SKILL.md`.
2. Fetch directly referenced files that affect behavior.
3. Summarize trigger, workflow, support files, validation and safety gates, strengths, gaps, and adaptation ideas.
4. Ask whether to adapt into a local skill, compare, or keep researching.

## Create A Local Skill From Research

Use this when the user chooses to create a skill from findings or asks to synthesize one. Read `references/agent-skills-guide.md` before planning.

Before writing files:

1. Build a research synthesis:
   - User need and constraints.
   - Inspected source skills and useful patterns.
   - Quality and UX gates to include.
   - Resources to create, if any.
   - Exclusions: copied, generic, risky, or unnecessary pieces.
2. Present a short plan:
   - Skill name and destination.
   - Trigger description draft.
   - Workflow outline.
   - Resources and validation plan.
3. Ask for approval with create, adjust, inspect more, or cancel options.

After approval, write the skill with concise purpose, workflow, tool and resource rules, gates, output UX, and recovery paths. Add `references/`, `scripts/`, or `assets/` only when they reduce repeated work or keep `SKILL.md` lean.

When the synthesized skill draws from external sources, record the audit trail using the shape in `references/references-template.md` — either as a section in the design log that authorizes the skill (preferred) or as a `references.md` inside the new skill folder (if no design log exists). Populate it with every source actually consulted — do not list sources that were not checked.

## Recovery

- No results: broaden terms once, inspect repo roots, or fall back to seed collections.
- Too many generic results: narrow by domain, agent, tool, workflow verb, or safety requirement.
- Strong repo but no skill path: browse root, `skills/`, `.claude/skills/`, `.cursor/skills/`, then category folders.
- Missing frontmatter: skip the candidate.
- Missing referenced files: lower confidence and mention the gap.
- Unsafe behavior: do not recommend; explain the risk and offer a safer adaptation.
- Marketplace per-skill URL 404 (e.g. `https://www.skills.sh/<owner>/<repo>/<skill-name>`): the skill is not in that public index. Fall back to the source repo and lower confidence.
- Registry API rate-limit or 5xx: switch to `llms.txt` / `llms-full.txt` snapshot or to GitHub topic search; see `references/discovery-surfaces.md` §Recovery.
- Manifest file expected but missing (`.claude-plugin/marketplace.json`, `llms.txt`): note the gap as a quality signal and continue from raw `SKILL.md` evidence.
- Tool or API unavailable: state what evidence is missing, map the failed verb to an alternative runtime tool when one exists, and ask the user whether to switch source, drop to a fallback, or stop.
