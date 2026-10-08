---
name: research-codebase
description: Investigate a codebase with system awareness — read boundaries, ownership, control flows, data flows, contracts, and blast radius BEFORE recommending action. Produces a structured understanding artifact with every claim cited file:line. Use when the user asks to "understand this codebase", "deep-dive this feature", "trace this flow", "why is this slow/flaky/coupled", "is this PR safe", "what breaks if I change Y", "prepare to refactor Z", "investigate this bug at the system level". For research from external sources (URLs, docs, Slack), use a research command in mtg or similar. For greenfield architecture design, this is not the right tool.
argument-hint: "<question or scope — e.g., 'how does auth work in /api', 'what breaks if I change User.id type'>"
---

# research-codebase

Understand a codebase by reading its boundaries, contracts, flows, and blast radius before recommending any action. Do not infer system behavior or impact from a single-file view. A literal source fact may need only one exact file.

## Tools

Built-in: Read, Grep, Glob, Edit, Write
Shell:    Bash — preferred when available:
  - `rg` (ripgrep) — fast structural search; respects `.gitignore`
  - `sg` (ast-grep) — AST pattern matching across languages
  - Static analyzers / dependency scanners configured in the host project (invoke via `npx` or the project's equivalent for its language)
  - Plain `grep` / `find` as the floor — name the checks these tools cannot establish

LSP-backed navigation (definitions, references) is an editor concern, not a shell concern. Confidence depends on evidence for the claim, not tool availability alone. Missing LSP matters when the remaining evidence cannot establish symbol identity or reachability.

## Operating Model

```text
SCOPE → INVENTORY → INVESTIGATE → CITE → SYNTHESIZE → REPORT
```

Compress when the user's scope is narrow (e.g., one specific function). Keep `INDEX.md`, at least one numbered shard and `understanding.md` even for literal lookups. Expand when investigating across modules, across packages, or across system boundaries. Follow the phase order for tool calls, not just report headings; do not gather evidence first and backfill phase files afterward.

## Hard Rules

- **Every claim cites `file:line`** — code claims need file path + line number; structural claims need a file path; behavioral claims need command output (test result, build log, runtime trace). No uncited assertions.
- **Confidence labels are explicit** — every architecture-level claim is `confirmed` (sufficient inspected evidence), `likely` (indirect or incomplete proof), or `uncertain` (a material gap or surviving contradiction). Never present uncertain claims as confirmed.
- **Match breadth to the claim** — literal source facts can stop at sufficient exact evidence. System, flow, behavior and impact conclusions require relevant boundaries and consumers; go wider before making them.
- **Hard gates** before recommending any change that:
  - Touches public contracts (types, schemas, wire protocols affecting external consumers)
  - Crosses architecture layers (UI calling DB directly, service reaching into UI, etc.)
  - Is destructive (file deletes, table drops, force-pushes, irreversible migrations)
  - Has large blast radius (>10 files or >3 modules)
- **No recommendation without supporting evidence** — if you can't cite it, you can't claim it. Mark gaps as `uncertain` and proceed.

## Stop Conditions

- The understanding artifact answers the user's actual question
- 3 investigation angles have returned no new evidence not already examined
- A change recommendation is blocked by a hard gate awaiting user approval
- Cost (time, file reads) has clearly exceeded the value of more depth

## Phase 1: Scope

Extract before reading code:

- **Question**: what is the user actually asking? (understand-the-system / trace-a-flow / safety-of-a-change / find-root-cause / prepare-for-refactor)
- **Boundary**: which directories, files, modules, or domain entities are in scope?
- **Depth target**: quick perspective check / focused trace / full architecture-health investigation
- **Constraints**: language, framework, IDE, what tools are available
- **Output expectation**: what does the user want to walk away with?

Ask one focused clarifying question only when the answer materially changes scope or depth. Otherwise proceed with stated assumptions.

Before the first code read, write the scope as the first section of `INDEX.md` inside a new numbered folder at `.ai/codebase-research/<NNN>-<topic>/` (find the next available `NNN` by scanning the directory; derive a short kebab-case `<topic>` from the user's question). The folder is the investigation's anchor; `INDEX.md` is its manifest.

## Phase 2: Inventory

Map the surface area before diving in.

- List entry points (CLI commands, HTTP routes, exported APIs, message handlers, scheduled jobs)
- List modules / packages / layers and their dependency direction
- Identify ownership signals: `CODEOWNERS`, module READMEs, package authors, commit-author concentration
- Note language-server / AST / scanner tool availability for the codebase

Write inventory findings to a numbered shard inside the investigation folder, e.g. `.ai/codebase-research/<NNN>-<topic>/01-inventory.md`, then update `INDEX.md` with a one-line summary and a link to the shard. Finish these writes before tracing flows, evaluating callers or diagnosing a cause.

## Phase 3: Investigate

Read code to answer the scoped question. Investigation moves through these surfaces — touch only what the question requires:

| Surface | What to gather | Evidence |
|---|---|---|
| **Control flows** | Numbered call paths from entry point to terminal action | `rg` / `sg` for symbol → `file:line`; editor-side language-server goto-definition for confirmation when available |
| **Data flows** | Writers, readers, transaction boundaries, caches, per entity | `rg` / `sg` for writer patterns (`update`, `insert`, `set`, `save`) → trace to readers |
| **Types & protocols** | Boundary DTOs / schemas / wire contracts; compatibility posture | inspect type definitions, schema files, API contracts |
| **Boundaries & ownership** | Module ownership, ports, contract tests | `CODEOWNERS`, module READMEs, dependency scanner output (whatever the project provides) |
| **Duplication** | Top near-clones; the missing abstraction | `sg` patterns for structural duplication; otherwise `rg` + careful reading |
| **Execution profile** | Hot paths, async/sync posture, retry/timeout/lifecycle, runtime risks | inspect concurrency primitives, queue use, timeout configs |
| **Architecture health** | One line per principle and per dimension; confidence-labeled | aggregated from above; cite per claim |
| **Clean-code hotspots** | Top static-analyzer findings worth fixing | static-analyzer output from project's configured tools → `file:line` |

For a bug claim, identify actual behavior, the expected supported contract and evidence of its violation. Confirm root cause only with mechanism, trigger, first divergence and decisive causal evidence. Test and rule out credible competing explanations when present. If none is credible, record why and require direct causal/counterfactual proof; do not invent an alternate. Missing decisive evidence or a surviving explanation keeps the result a hypothesis with a named next check.

An empty search establishes only what was searched. For absence, unused-code or safe-change claims, record scope, filters/exclusions, dynamic paths and relevant consumers/tests/configuration; corroborate with another relevant evidence angle. If coverage or corroboration is missing, report the bounded observation and gap. Lexical hits alone do not establish semantic identity or global absence.

After each surface, write its findings to a numbered shard in `.ai/codebase-research/<NNN>-<topic>/`, e.g. `02-control-flows.md`, `03-data-flows.md`, `04-boundaries.md`, then update `INDEX.md` with the shard link and a one-line summary before investigating the next surface. Do NOT batch findings in memory across surfaces — write per surface so context compaction can't lose work.

## Phase 4: Cite

Verify before reporting:

- Every claim has a `file:line` (or `file` for structural, or command-output for behavioral)
- Every confidence label is honestly assigned (`confirmed` / `likely` / `uncertain`)
- Every gap is named (what you didn't inspect, and why it was out of scope)

If any claim can't be cited, mark it `uncertain` and downgrade. Check root-cause and search-coverage receipts before assigning confidence; a source snippet alone does not prove runtime causality or global absence.

## Phase 5: Synthesize

Before writing `understanding.md`, re-read each numbered shard from disk using an available read tool, then build the understanding artifact. Do not substitute remembered text or a previous Write result for this read, or claim a read that did not occur.

Required sections (always present, even as "N/A + reason"). For a literal lookup, keep entries short and apply self-checks only to relevant claims; do not infer an effective runtime value from a declared default when overrides may apply:

| # | Section | Contents |
|---|---|---|
| 1 | **System summary** | What it does, who consumes it, invariants — 2-4 sentences |
| 2 | **Control flows** | Numbered call paths, each step cited |
| 3 | **Boundaries & ownership** | Module ownership table |
| 4 | **Architecture health** | Per-principle / per-dimension status (confirmed / likely / uncertain) |
| 5 | **Next step** | One sentence |

Applicable sections (present when the question touches that surface):

| Section | Present when |
|---|---|
| Data flows | The question involves state, persistence, or caching |
| Types & protocols | The question involves contracts, schemas, or wire formats |
| Duplication inventory | The question is refactor- or quality-oriented |
| Execution profile | The question is perf or reliability oriented |
| Clean-code hotspots | The question is quality-oriented |

For change-impact questions, also include:

- **Change flow** — the call path the change traverses
- **Data-flow impact** — entities read/written; transaction/cache semantics preserved
- **Contract impact** — types/schemas/protocols touched; compatibility posture (backwards-compatible / breaking-with-migration / additive-only)
- **Blast radius** — callers and consumers touched, labeled by layer
- **Risk vector** — which principles/dimensions the change stresses; how each is preserved

Write the artifact to `.ai/codebase-research/<NNN>-<topic>/understanding.md`. Add a link to it as the final entry in `INDEX.md` under a `## Synthesis` heading.

## Phase 6: Report

Present a compact summary to the user, leading with the answer to the original question. Link to `understanding.md` for the full artifact.

Output shape:

```text
Question: <restated>
Answer: <one paragraph — the actual answer, cited>

Confidence: confirmed | likely | uncertain (per major claim)
Gaps: <what wasn't inspected, and why>
Next step: <one sentence>

Full artifact: .ai/codebase-research/<NNN>-<topic>/understanding.md
Investigation folder: .ai/codebase-research/<NNN>-<topic>/ (INDEX.md + shards)
```

If a change recommendation is in scope, end with one of:

```text
1. Approve the change as analyzed
2. Investigate further — name surface (control flow / data flow / contracts / blast radius / ...)
3. Hard-gate held — public-contract / cross-layer / destructive / large-blast-radius change blocked for explicit approval
4. Cancel
```

## Artifact Self-Check

Before reporting, verify the artifact answers all of:

- **Ownership** — who owns this code?
- **Boundary** — what layer / module is this in? Does the change (if any) respect it?
- **Blast radius** — consumers (cited), layers touched, contracts affected
- **Contract safety** — types/schemas/protocols, compatibility posture explicit
- **Local vs structural vs architectural** — what level of change is this really?
- **Build/config involvement** — does the change touch CI, deploy, config files?
- **Reliability under failure / retry / concurrency** — what happens on the unhappy path?
- **Observability sufficiency** — can ops see this in traces / metrics / logs?
- **Rollout / migration reversibility** — can the change be backed out?
- **Folder bloat and naming fitness** — does this fit the module's existing shape?
- **Modularity trajectory** — does this change increase or decrease coupling?
- **Documented assumptions** — what did the original author assume? Still true?
- **Safest next move** — single concrete sentence

For system, flow, behavior or impact conclusions, verify relevant boundaries and consumers before reporting. A literal source lookup can use one exact file; mark unrelated self-checks N/A with a reason.

## Recovery

- **No language-server / AST / scanner available** — use grep + careful reading; assign confidence from the remaining evidence and name missing checks. Exact literal facts may still be confirmed.
- **Scope too broad to inspect fully** — present the user with a narrower scope offer; ask for re-scope before investing further reading
- **Conflicting evidence across files** — record both, mark `uncertain`, surface the conflict in the report — don't paper over it
- **Hard gate triggered** — STOP, present the change profile, require explicit user approval before recommending; do not soft-pedal to bypass
- **Out-of-scope symbol or file shows up repeatedly** — note it in the inventory shard and `INDEX.md` as a discovery, ask user whether to expand scope or skip

## Anti-Patterns

| # | Anti-pattern | Why it fails |
|---|---|---|
| 1 | Inferring the system from one file | Literal facts can be local; system and impact claims need relevant boundaries |
| 2 | Reporting without citations | The user has to re-verify everything; the artifact has no audit trail |
| 3 | Marking everything `confirmed` | Inflated confidence misleads decisions |
| 4 | Recommending a change before mapping blast radius | Surprises in production |
| 5 | Batching multiple-surface findings in memory before writing | Context compaction erases work |
| 6 | "It looks fine" as a finding | Not a finding — no citation, no judgment, no value |
| 7 | Skipping the gate when the change is destructive but "obviously fine" | The gate exists for exactly that confidence failure mode |
