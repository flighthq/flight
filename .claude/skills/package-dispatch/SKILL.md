---
name: package-dispatch
description: >-
  Turn blessed work into per-worker briefs staged under outgoing/<target-worktree>/<pkg>.md, ready for the host's `npm run assign:worktree <worktree>` to deposit into that worker's assignments/ inbox. Every brief carries the frozen scope (assessment.md › Approved items, verbatim), a target delta (current verdict/score → expected), an Acceptance section (checkable definition-of-done + the exact verify commands), stop-and-ask rules, and the reporting contract — so a worker's delivery is measurable against the promise on ingest, not taken on faith. Use when asked to "dispatch <package>", "brief the workers", "fan out the approved work", or after an approval session. Read tools/agents/docs/packages/index.md (the Dispatching section) and CONTRACT.md first.
---

# Package Dispatch

You are the **dispatch stage** — the outbound half of the worker loop. Input: one or more packages whose `assessment.md › Approved` ledger has unexecuted items (or a session in which the user is blessing scope right now). Output: one brief per package, staged at `outgoing/<target-worktree>/<pkg>.md` (repo root, gitignored). The host then runs `npm run assign:worktree <worktree-path>`, which deposits the slice into that worktree's `tools/agents/docs/assignments/` inbox. You never write across a worktree boundary — staging is the entire job.

The problem this stage exists to solve: **the buyer thinks they blessed a 95% package and the worker delivers 10%.** The defense is that every brief is a _contract_, not a wish: frozen scope, a numeric target, checkable acceptance, and a reporting format the ingest review can verify line-by-line. A brief missing any of these is not ready to dispatch.

## Inputs

1. `tools/agents/docs/packages/<name>/assessment.md` — the **Approved** ledger is the only self-authorizing scope. `Recommended` items may be included **only** when the user blesses them in this session (freeze them into `Approved` first, per CONTRACT.md's provenance stamp — that is the approval gate, and dispatch never bypasses it).
2. `tools/agents/docs/packages/<name>/charter.md` — the worker's rubric; the brief links it and must not contradict it.
3. `tools/agents/docs/packages/<name>/review.md` — the current verdict/score, the "before" of the target delta.
4. `tools/agents/docs/packages/TODO.md` — for lane-sizing context (what else is adjacent).

## Brief anatomy (all sections required)

```markdown
---
package: '@flighthq/<name>'
dispatched: YYYY-MM-DD
session: <one-line provenance: which review/approval session authored this>
target: { from: '<verdict> <score>', to: '<verdict> ~<score>' }
---

# <name> — Work brief

## Scope (frozen)

<The Approved items, copied VERBATIM with their provenance stamps — never a live pointer to "the recommended list". Plus any session-authored directives, each stamped with this session.>

## Rubric

Read first: tools/agents/docs/packages/<name>/charter.md (vision, Boundaries, Decisions) and review.md (current state). The charter wins any conflict with this brief — stop and ask instead of guessing.

## Acceptance (definition of done)

<One checkbox per Scope item, phrased as an observable fact ("`parseTextureAtlas` exists, registry-dispatched, with colocated tests"), NOT as activity ("work on parsing"). Then the exact verify commands, e.g.:>

- [ ] <observable outcome per item>
- [ ] `npm run test --workspace=packages/<name>` passes
- [ ] `npm run check` clean (packages:check, typecheck, lint, format, order, exports)
- [ ] `npm run size` baseline unmoved for unrelated examples (if exports changed)
- [ ] functional test / capture updated (if the change is visual)

## Stop-and-ask (hard boundaries)

- No edits outside `packages/<name>/` (+ its colocated tests, + `@flighthq/types` only where the Scope explicitly says so).
- No renames, removals, or new packages beyond the Scope.
- A blocker or a discovered design fork goes to `tools/agents/docs/status/_QUESTIONS.md` — do not resolve it unilaterally, do not silently skip the item.

## Reporting contract

Write `tools/agents/docs/status/<name>.md` (flat tray — never into the cell): per Scope item, `done | partial | skipped(reason) | blocked(question)`, with file/test evidence for each `done`, plus a self-score against the target delta. Claims are verified line-by-line on ingest; unverifiable claims count as undelivered.
```

## Rules

- **Freeze, don't reference.** The Scope section materializes the approved items at dispatch time. If the assessment regenerates later, the brief must still say exactly what was bought.
- **Target delta is numeric.** "from: partial 45, to: solid ~70" gives the ingest review a promised number to verify against. The precedent works: workers self-score, the re-review lands its own score, and the gap is the quality signal (a worker claiming 92 that reviews at 88 is healthy; claiming 95 that reviews at 10 is caught in one line).
- **Lane-size the brief.** A worker session is hours, not minutes. Bundle the package's full approved sweep — and, when blessed, the next maturation tier slice — into one brief rather than dribbling single items. If a package has only one 10-minute item, batch it with a sibling package's brief for the same worker rather than burning a lane on it.
- **New-package briefs** (chartered-unbuilt cells): Scope = the charter's North star sliced to a Bronze target; Acceptance additionally requires a Package Map entry, register update, `packages:check` passing with the new package, and the upstream-library oracle named (what the result is measured against). These briefs are larger — one package per worker.
- **Route by staging directory.** One directory per target worktree under `outgoing/`; a worker only ever receives its own slice. Tell the user which `npm run assign:worktree <path>` invocations to run on the host.

## The closed loop

```
bless (Approved) ─► package-dispatch stages outgoing/ ─► assign:worktree (host)
  ─► worker executes against Acceptance, reports status/<pkg>.md
  ─► get:worktree ─► distribute-status ─► package-review verifies claims
  ─► package-assess refreshes ─► todo.mjs regenerates ─► next bless
```

The ingest review (`package-review`) is the enforcement arm: it reads the brief's target delta and the worker's self-report, verifies each claim against source (AS-CLAIMED → verified), and its new score makes the delivered-vs-promised gap explicit. Dispatch without acceptance criteria is how 10% deliveries pass as 95% — never skip the section.
