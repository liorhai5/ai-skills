---
name: optimize-skill
description: Use when the user asks to "optimize this prompt", "improve this SKILL.md", "make this prompt more reliable", "fix my agent instructions", "review this AGENTS.md", "strengthen this prompt", "my agent keeps skipping steps", "add enforcement to instructions", or needs to transform weak prompts into reliable, enforceable agent protocols. Uses a 6-step gated flow (with Fast/Full modes), command strengthening, gate injection, and failure mode analysis.
argument-hint: "rate <path> | improve <path>"
---

# optimize-skill

## Tools

Built-in: Read, Edit, Write, WebFetch
Shell:    Bash (no external CLIs required)

## What This Does

Analyzes and improves instructional prompts, documentation, and agent instructions using prompt engineering best practices while preserving original intent.

## When To Use

- Creating or improving prompts
- Agents skip steps or ignore instructions
- Instructions lack enforcement
- Output format is inconsistent
- Reviewing any instruction document or prompt
- Strengthening agent-operational text without changing business/domain logic

## Modes

The skill has two invocation modes, both producing the same report shape:

| Mode | Invocation | Behavior |
|------|------------|----------|
| **Rate** | `/optimize-skill rate <path>` | Read → Understand → Rate → write report → stop. **Does NOT modify** `<path>`. |
| **Improve** | `/optimize-skill improve <path>` | Read → Understand → Rate → Fix → Validate → write report → **ask user to approve** → update `<path>` in-place after approval. |

If the user invokes without `rate` / `improve` prefix, default to `improve` (the more useful flow), but explicitly confirm the mode in the first message.

## Critical Rules

**Forbidden at all times:**
1. Changing good parts that already work
2. Changing the existing logic/intent of prompts
3. Making changes before understanding the prompt
4. Leaving weak words in critical sections
5. Outputting without validation
6. Over-strengthening soft guidance
7. Skipping gates or checkboxes
8. Bloating prompts — target line count increase <10%; if >10%, MUST document a one-line justification in VALIDATE

**Reinforcement Pattern (for critical rules):**
- **STATE:** "You MUST preserve working logic AND follow all gates in order"
- **FORBID:** "FORBIDDEN: Altering intent without user approval"
- **FORBID:** "FORBIDDEN: Skipping steps or gates"
- **REQUIRE:** "REQUIRED: Validate all changes before output AND complete all checkboxes"

**Violation invalidates optimization. Start over if violated.**

## Tool Control

**Forbidden during optimization:**
- Direct file/system modification that bypasses quality gates
- Any tool usage that executes code or commands unrelated to prompt optimization
- Tools that skip the READ → UNDERSTAND → RATE → FIX → VALIDATE flow

**Allowed:**
- Read-only file access (to read prompt files)
- Safe file edit/write capability (ONLY after VALIDATE step passes AND user approves in `improve` mode)
- Clarification question capability (for user clarification)
- Text output (all phases)

**Compatibility note:**
- Map capability names to the active runtime's tool names.
- Example aliases: read-only file access = Read/ReadFile; safe file edit/write = Write/StrReplace/ApplyPatch.
- **IF** the runtime is read-only or lacks a safe write tool → **THEN** output the optimized text or delta without attempting file edits.

## Output Convention

Outputs are consistent across both modes:

| Artifact | Path | Always Written? |
|----------|------|-----------------|
| **Report** | `.ai/optimize-skill/<NNN>-<topic>/report.md` | **Yes** — every invocation, both modes |
| **Updated target file** | The original `<path>` (in-place) | **Only in `improve` mode after user approval** |

**Topic naming:** derive `<topic>` from the target filename (e.g., target `~/.agents/skills/mtg/commands/design.md` → topic `mtg-design`). Use the next available `NNN` by scanning `.ai/optimize-skill/`.

**Report structure (always the same):**

```markdown
# Optimize-Skill Report — <topic>

**Target:** <absolute path>
**Mode:** rate | improve
**Date:** <YYYY-MM-DD>

## Understanding
[Goal, logical parts, flow — from Step 2]

## Issues Found
| Part | Issue | Severity | Fix |
|------|-------|----------|-----|
| ... | ... | Critical/High/Medium/Low | ... |

## Proposed Fixes
[For each Critical/High issue, the specific text change proposed.]

## Validation
[Validation checklist results — what passed, what was waived with justification.]

## Changes Applied
[Empty in rate mode. In improve mode after approval: list of diffs applied to target.]

## Residual Risk
[Items left as-is and why.]
```

**Improve mode approval gate:**
After producing the report (sections up to "Changes Applied"), display the report to the user and prompt:
```
Apply these fixes to <path>? [Y/n]
```
On Y: update `<path>` in-place; append "Changes Applied" section with the diff summary.
On n: leave `<path>` untouched; mark report status "rate-only (user declined fixes)".

## Execution Flow

```
READ → UNDERSTAND → RATE → FIX → VALIDATE → OUTPUT
  ↓         ↓          ↓      ↓        ↓         ↓
 GATE      GATE       GATE   GATE     GATE      GATE
```

| Step | Action | Gate Requirement | Forbidden Until Gate Passes |
|------|--------|------------------|-----------------------------|
| 1 | **READ** the prompt completely | All checkboxes checked | Analysis, changes |
| 2 | **UNDERSTAND** what the prompt does | Understanding output produced | Rating, fixes |
| 3 | **RATE** each part for issues | Issues table produced | Fixing issues |
| 4 | **FIX** issues by severity | All Critical/High fixed | Validation |
| 5 | **VALIDATE** against checklist | All REQUIRED checks pass | Output |
| 6 | **OUTPUT** report (+ approval gate in improve mode) | Format followed exactly | N/A |

**Critical:** You MUST complete each gate before proceeding. DO NOT skip steps.

**Global rules** (the Critical Rules section + VALIDATE checklist) apply throughout every step; per-step gate sections focus on step-specific requirements.

### Mode Selection (depth of execution)

| Path | Use When | Allowed Compression | Non-negotiables |
|------|----------|---------------------|-----------------|
| **Fast Path** | Short/single-purpose prompt, low ambiguity, ≤3 logical parts, no unresolved unknowns | READ+UNDERSTAND may be combined; RATE+FIX may be compacted into one section if issues table is still produced | VALIDATE and intent-preservation checks are ALWAYS required |
| **Full Path** | Multi-section prompt, high ambiguity, ≥4 logical parts, conflicting constraints, or Critical/High risk | No compression. Execute each gate separately | All gates and templates required |

**Selection rules:**
- **IF** any unknown blocks progress, conflicting instructions exist, or Critical/High issues are likely → **THEN** use Full Path.
- **IF** prompt is simple and unambiguous with low risk → **THEN** Fast Path is allowed.
- **IF** uncertain which mode applies → **THEN** default to Full Path.

### Quick Mode (small tasks)

- **IF** task is very small and unambiguous → **THEN** use Fast Path with concise outputs.
- **MUST:** preserve intent, perform a minimal issue scan, and pass VALIDATE before output.
- **MUST:** still produce the report (Output Convention applies to all modes).
- **IF** ambiguity, conflict, or High/Critical risk appears → **THEN** escalate to Full Path immediately.

---

## Step 1: READ

**STOP. DO NOT proceed to analysis.**

### Pre-Conditions
- [ ] User provided prompt/file to optimize
- [ ] Path is valid and readable

### Actions (REQUIRED)
1. MUST read the input file completely
2. MUST note the document type and purpose
3. MUST count approximate line count

### Gate Check
- [ ] File read completely (no skipped sections)
- [ ] Document type identified
- [ ] Line count noted

### FORBIDDEN
- Making ANY changes before reading
- Skipping sections

### ALLOWED
- Read-only file access only
- Text output to confirm reading

### On Failure
- **IF** file unreadable and inline content exists → **THEN** continue using the provided content
- **IF** file unreadable and no content exists → **THEN** ask user for correct path
- **IF** file empty → **THEN** ask user to provide content

---

## Step 2: UNDERSTAND

**STOP. DO NOT proceed to rating. Understand what this prompt does first.**

### Pre-Conditions
- [ ] Step 1 (READ) completed
- [ ] File content in context

### Actions (REQUIRED)
1. MUST identify the **goal** — what is this prompt supposed to achieve?
2. MUST identify **logical parts** — break down into sections/phases/steps
3. MUST identify **flow** — how do the parts connect?
4. MUST document understanding in output format below (this becomes the `## Understanding` section of the final report)

### Output Format (REQUIRED)
```markdown
## Understanding

**Goal:** [What the prompt achieves]

**Logical Parts:**
1. [Part name] — [purpose]
2. [Part name] — [purpose]
...

**Flow:** [How parts connect]
```

### Assumptions & Unknowns (REQUIRED if prompt is underspecified)
```markdown
## Assumptions & Unknowns

**Assumptions (temporary — proceeding with these):**
- [Assumption 1] — Impact if wrong: [consequence]

**Unknowns (MUST ask before proceeding):**
- [Unknown 1] — Why critical: [reason]

**Clarification needed:** Yes/No
```
**IF** Unknowns exist → **THEN** STOP and ask user before proceeding to RATE.

### Gate Check
- [ ] Goal clearly stated
- [ ] All logical parts identified
- [ ] Flow documented
- [ ] Understanding output produced

### Reflection
- Did I understand the intent correctly?
- Did I identify all logical parts?

**IF** you are uncertain about your understanding → **THEN** re-read before proceeding. DO NOT guess.

### FORBIDDEN
- Proceeding without understanding the goal
- Making changes based on assumptions

### ALLOWED
- Text output (understanding summary)
- Re-reading file if needed

### On Failure
- **IF** intent unclear → **THEN** ask user for clarification
- **IF** multiple interpretations → **THEN** present options and WAIT for user choice

---

## Step 3: RATE

**STOP. DO NOT fix anything yet. Rate each logical part for issues first.**

### Pre-Conditions
- [ ] Step 2 (UNDERSTAND) completed
- [ ] Understanding output produced

### Issue Categories (MUST check all)

| Category | What to Look For | Severity |
|----------|------------------|----------|
| **Weak Words** | "consider", "might", "could", "may", "should" in critical sections | Critical |
| **Missing Enforcement** | Rules without FORBIDDEN/ALLOWED | High |
| **Ambiguous Instructions** | "do some", "handle", "process" without specifics | High |
| **Referential Ambiguity** | "it", "this", "that", "above", "below" without clear antecedent | High |
| **Missing Output Format** | Expected outputs without templates | Medium |
| **Missing Gates** | Phase transitions without checkpoints | Medium |
| **Duplication** | Same logic/rule repeated in multiple places (not just examples) | Medium |
| **Verbose/Bloat** | Sections >20 lines that could be tables; prose without constraints | Medium |
| **Emoji as Instructions** | Emojis used as commands instead of strong words | Medium |
| **Redundancy** | Same example repeated, unnecessary variations | Low |
| **Low Density** | Explanations that don't constrain behavior | Low |

### Rating Output (REQUIRED — becomes `## Issues Found` in report)
```markdown
## Issues Found

| Part | Issue | Severity | Fix Needed |
|------|-------|----------|------------|
| [Part name] | [Description] | Critical/High/Medium/Low | [What to do] |
```

### Gate Check
- [ ] All logical parts rated
- [ ] Weak word scan completed
- [ ] Issues table produced
- [ ] Severity assigned to each issue

### FORBIDDEN
- Fixing issues before completing rating
- Ignoring critical issues
- Skipping weak word scan

### ALLOWED
- Text output (issues table)
- Re-reading parts for rating

### On Failure
- **IF** no issues found → **THEN** MUST double-check with weak word scan
- **IF** scan still clean → **THEN** document "No issues found" and proceed

### Weak Word Reference

| Weak Word | Context | Replacement |
|-----------|---------|-------------|
| consider, might, could, may | Critical section | **MUST**, **REQUIRED** |
| consider, might, could, may | Optional guidance | Remove or keep with "optionally" |
| should, prefer | Critical section | **MUST** |
| should, prefer | Soft guidance | Keep as-is |
| do some, handle, process | Any | Specify exact action: "Run X", "Call Y" |
| as needed, if necessary | Any | **IF** [condition] → **THEN** [action] |
| feel free to, you can | Required action | Remove entirely, use **MUST** |
| feel free to, you can | Optional action | "Optionally, you may..." |

**Critical:** Weak words in FORBIDDEN/MUST/NEVER sections MUST be replaced.

---

## Step 4: FIX

**STOP. Fix issues in priority order: Critical → High → Medium → Low.**

In `rate` mode: SKIP this step (rate mode terminates after RATE + VALIDATE without applying fixes).
In `improve` mode: execute fully.

### Pre-Conditions
- [ ] Step 3 (RATE) completed
- [ ] Issues table produced
- [ ] Mode is `improve` (skip if `rate`)

### Fix Priority (MUST follow order)
1. **Critical first** — Weak words in MUST/FORBIDDEN contexts
2. **High next** — Missing enforcement, ambiguous instructions
3. **Medium** — Missing output formats, missing gates
4. **Low last** — Redundancy, density (only if value added)

### Command Strength Hierarchy

| Strength | Keywords | Use For |
|----------|----------|---------|
| Absolute | NEVER, ALWAYS, MUST, FORBIDDEN, CRITICAL | Non-negotiable rules |
| Stop | STOP, HALT, DO NOT proceed, WAIT | Gates/checkpoints |
| Required | REQUIRED, MANDATORY | Essential steps |
| Soft | should, prefer | Optional guidance only |

### Reinforcement Pattern (REQUIRED for Critical Rules)
```
1. STATE: "You MUST X"
2. FORBID: "FORBIDDEN: Not doing X"
3. REQUIRE: "REQUIRED: Verify X complete"
```

### Reasoning Block (CONDITIONAL REQUIRED Before Changes)
**REQUIRED when:**
- Full Path is active, OR
- Fast Path has any Critical/High issue.

**Optional when:**
- Fast Path has only Medium/Low issues; include one-line rationale instead.

Before making changes (when required), produce a reasoning block:
```markdown
## Reasoning

1. **Current state:** [What exists now]
2. **Goal:** [What we are trying to achieve]
3. **Approach:** [Why this specific change]
4. **Risk:** [What could go wrong]
```

### Gate Template (When Adding Gates)
When proposing a new gate to inject into the target prompt, use this template:

```markdown
## [Gate Name]

**STOP. DO NOT proceed. [What to verify]**

### Pre-Conditions
- [ ] [Previous step completed]

### Actions (REQUIRED)
1. [Action]

### Gate Check
- [ ] [Condition]

### FORBIDDEN
- [What not to do]

### ALLOWED
- [What is permitted]

### On Failure
- **IF** [condition] → **THEN** [recovery]
```

### Gate Check
- [ ] All Critical issues fixed
- [ ] All High issues fixed
- [ ] Medium/Low addressed or documented as skipped
- [ ] Reasoning requirement satisfied (block produced OR Fast Path low-risk rationale documented)

### FORBIDDEN
- Over-strengthening soft guidance (keep "should" for optional items)
- Changing logic that already works
- Adding unnecessary complexity
- Skipping Critical/High issues
- Bloating: >10% line increase without explicit justification in VALIDATE

### ALLOWED
- Text output (draft fixes — these go into `## Proposed Fixes` in the report)
- Iterating on fixes

### On Failure
- **IF** over-strengthening detected → **THEN** revert and re-assess using RATE step criteria
- **IF** unsure if logic changed → **THEN** compare before/after intent

---

## Step 5: VALIDATE

**STOP. DO NOT output yet. Validate all fixes against checklist.**

In `rate` mode: validate the rating itself (issues are real, severities are accurate, fixes proposed are sound) — skip checks tied to actually applying fixes.
In `improve` mode: validate proposed fixes are correct before presenting to user for approval.

### Pre-Conditions
- [ ] Step 4 (FIX) completed (improve mode) OR Step 3 (RATE) completed (rate mode)
- [ ] All Critical/High issues addressed (improve mode)

### Validation Checklist (MUST complete all that apply)

**REQUIRED checks (both modes):**
- [ ] Original intent preserved (in proposed fixes, if improve mode)
- [ ] No weak words remain in critical sections of the proposed text (improve mode)
- [ ] Critical rules use MUST/NEVER/FORBIDDEN
- [ ] No conversational filler
- [ ] No conflicting instructions
- [ ] Logical flow preserved
- [ ] Reinforcement Pattern applied to critical rules (improve mode)
- [ ] Line count target met (<10%) OR justified exception documented (improve mode)
- [ ] Any >10% increase includes one-line reason linked to required gate/clarity fixes (improve mode)

**Additional checks (if applicable):**
- [ ] Gates have Pre-Conditions, Gate Check, FORBIDDEN, ALLOWED, On Failure
- [ ] Outputs have format specifications
- [ ] IF/THEN rules for decision points

**Referential Clarity (MUST check):**
- [ ] No ambiguous pronouns or positional references without explicit antecedent
- [ ] All entities have stable names (same term throughout)
- [ ] Steps/outputs referenced by name, not position
- [ ] All cross-references are unambiguous
- [ ] No implicit "the" references without clear antecedent
- [ ] XML tags are optional; use only for attention-control needs (Markdown remains default)

### Reflection (REQUIRED)
MUST answer these questions:
1. Would I trust this prompt to execute reliably?
2. What's the weakest remaining section?
3. Did I change any original intent? (MUST be NO)

**IF** weakness identified → **THEN** fix or document as limitation
**IF** intent changed → **THEN** STOP and revert. Return to UNDERSTAND step.

### Definition of Done (Fast Final Gate)
**ALL must be true before OUTPUT (improve mode):**
- [ ] Single execution path (no ambiguous branches)
- [ ] All inputs/outputs explicitly defined
- [ ] All decision points use IF/THEN
- [ ] No orphan references (every "it/this" resolved)

### Gate Check
- [ ] All REQUIRED checks pass
- [ ] Reflection questions answered
- [ ] No intent changes (improve mode)

### FORBIDDEN
- Outputting without completing validation
- Skipping checklist items
- Proceeding with failed checks
- Using XML tags outside attention-control needs (Markdown remains default)

### ALLOWED
- Text output (validation results — these become part of `## Validation` in the report)
- Returning to FIX step

### On Failure
- **IF** validation fails → **THEN** return to FIX step (improve mode) or revise rating (rate mode)
- **IF** intent changed → **THEN** return to UNDERSTAND step

---

## Step 6: OUTPUT

**STOP. Verify VALIDATE step passed before outputting.**

### Pre-Conditions
- [ ] Step 5 (VALIDATE) completed
- [ ] All REQUIRED checks passed
- [ ] No intent changes confirmed (improve mode)

### Output Actions

1. **Determine target folder:** scan `.ai/optimize-skill/` for the next `NNN`; derive `<topic>` from the target filename; create `.ai/optimize-skill/<NNN>-<topic>/`.
2. **Write report:** write `report.md` per the Output Convention shape (frontmatter + Understanding + Issues Found + Proposed Fixes + Validation + Residual Risk + empty "Changes Applied" placeholder).
3. **Display report:** show the report to the user in chat.
4. **Mode branch:**
   - **`rate` mode:** terminate. Final message: "Report saved to `.ai/optimize-skill/<NNN>-<topic>/report.md`. Mode: rate-only. No changes made to `<path>`."
   - **`improve` mode:** present approval gate:
     ```
     Apply these fixes to <path>? [Y/n]
     ```
     - On **Y**: apply the proposed changes to `<path>` in-place (use Edit / Write). Append `## Changes Applied` section to `report.md` with a diff summary. Final message: "Report saved to `.ai/optimize-skill/<NNN>-<topic>/report.md`. Changes applied to `<path>`."
     - On **n**: leave `<path>` untouched. Append `## Changes Applied` with status "rate-only (user declined fixes)". Final message: "Report saved. No changes applied (user declined)."

### FORBIDDEN
- Outputting without writing the report file
- Outputting without validation pass
- Applying changes in `rate` mode
- Applying changes in `improve` mode without explicit user approval
- Claiming a file was updated when the write policy prevented edits

### ALLOWED
- Read/Edit/Write capability to write report and (in improve mode after approval) update target
- Text output (report summary + approval prompt)

### On Failure
- **IF** report write fails → **THEN** display the report inline in chat and inform user no file was written
- **IF** target file unwritable in improve mode after approval → **THEN** show the diff and ask user to apply manually
- **IF** user requests changes during approval → **THEN** return to FIX step

---

## Reference: Instruction Precedence

**When rules conflict, follow this precedence (highest wins):**

| Priority | Category | Examples | Notes |
|----------|----------|----------|-------|
| 1 (highest) | Safety/Tool Restrictions | FORBIDDEN tools, NEVER actions | Always wins |
| 2 | User explicit request | "I want X", "Do Y" | Overrides defaults |
| 3 | FORBIDDEN/MUST rules | "FORBIDDEN: changing logic" | Overrides preferences |
| 4 | Skill defaults | Default behaviors, templates | Baseline |
| 5 (lowest) | Soft guidance | "prefer", "consider" | Yields to all above |

**Resolution rule:** When two rules conflict, the higher priority wins. Document the conflict and resolution.

---

## Reference: Conflict Resolution Micro-Protocol

Use this protocol when instructions conflict:

1. **Detect** — Name the two conflicting instructions explicitly.
2. **Resolve** — Apply precedence table (highest priority wins).
3. **Document** — Add one-line note: "Conflict: [A] vs [B] → Resolved by [priority N rule]".
4. **Continue** — Proceed using the resolved instruction only.

**FORBIDDEN:** Proceeding while both conflicting instructions remain active.

---

## Reference: Context Patterns

### State Summaries (Context Retention)
Use concise summaries only when needed to preserve context:
- Goal
- Progress
- Next step
- Blockers (if any)

**Conditional requirement:**
- Full Path: produce a state summary at each phase transition or context shift.
- Fast Path: produce a state summary only when context shifts materially.

---

## Reference: High-Value vs Low-Value Content

| Keep (High Value) | Remove/Reduce (Low Value) |
|-------------------|---------------------------|
| Tables with explicit actions | Explanatory prose without constraints |
| Imperative verbs (STOP, VERIFY, EXECUTE) | Repeated examples (keep 1-2) |
| FORBIDDEN/ALLOWED lists | Long paragraphs that can be tables |
| IF/THEN decision rules | Hedging language in critical rules |
| Markdown default + optional XML for attention control | Emoji used as instructions (unless required by output) |

---

## Quick Reference

Use this only as a mnemonic; gate sections are source of truth.

| Need | Pattern |
|------|---------|
| Stop/Checkpoint | `**STOP. DO NOT proceed.**` + `### Gate Check` |
| Mandatory action | `**REQUIRED:** You MUST [action]` |
| Prohibited action | `**FORBIDDEN:** [action]` |
| Decision logic | `**IF** [condition] → **THEN** [action]` |
| Critical rule hardening | Reinforcement Pattern: STATE + FORBID + REQUIRE |

---

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Over-strengthening soft guidance | "prefer" → "MUST" breaks optional flexibility | Keep "should/prefer" for truly optional items |
| Using "it/this/that" | Agent loses context, applies fix to wrong element | Name every entity explicitly |
| Changing working logic | User trusted original behavior | FORBIDDEN: If the logic works, don't touch it |
| Overusing XML tags | Noise and style drift without reliability gain | Keep Markdown default; use XML only for attention control |
| Outputting variants instead of one report | Different output shapes per run break audit trail | Use the single Output Convention report shape for every invocation |
