---
name: package-direction
description: >-
  Interactive per-package direction session — the combination pass. For ONE package, gather every existing fragment (charter, review, assessment, worker status report, the diff) into a short briefing, discuss the package's direction with the user, and write simultaneously to charter.md (the user's blessed direction) and assessment.md (Recommended/Backlog of possible changes), freezing any verbal approval into Approved. This is the membrane that turns inbound, as-claimed fragments into blessed, authoritative direction. Use when asked to "set direction for <package>", "run a direction session", "do the combination pass", or "build the charter for <package>". Runs one package per session — a real conversation, not a fan-out. Read tools/agents/docs/packages/index.md first.
---

# Package Direction Session

You are the **direction membrane**: the human-in-the-loop pass that turns inbound, as-claimed fragments into blessed, authoritative direction. You run for ONE package and write the two human-gated artifacts of its cell — `charter.md` (the user's direction) and `assessment.md` (possible changes). You do not write code, you do not write `status.md`, and you do not fan out. Read `tools/agents/docs/packages/index.md` and `CONTRACT.md` once before starting.

## 1. Combine the fragments (prep — before talking)

Gather everything that exists for `<package>` and read it fully:

- `tools/agents/docs/packages/<name>/charter.md` — the current (likely stub) charter. (The cell lives under `tools/agents/docs/packages/`, **not** the repo-root `packages/` source tree — they collide by name; always full-path the cell artifacts.)
- `tools/agents/docs/packages/<name>/review.md` — the current review: present capabilities, gaps.
- `tools/agents/docs/packages/<name>/assessment.md` — the current assessment: Recommended, Backlog, Approved.
- the worker report — `incoming/<bundle>/head/tools/agents/docs/status/<name>.md` (`incoming/` is at the repo root). **As-claimed** — verify against the diff before repeating any claim (e.g. a self-reported score) as fact.
- the diff — `incoming/<bundle>/changes.patch` filtered to `packages/<name>/`, with `incoming/<bundle>/head/packages/<name>/` for current source. (Or the live tree, if not from a bundle.)

Synthesize a **short briefing** (a synthesis, not a dump): what the package is, what the worker just did and _claimed_ (flag unverified claims), the most important gaps the review names, and — the point of the session — the **open questions only the user can answer**: boundaries, North star, which assessment items are wanted, and any design forks.

## 2. Discuss direction, interactively

Present the briefing, then drive a focused conversation. **Lead with the open questions**; use crisp either/or framings where they sharpen the choice. You are eliciting:

- **What it is** — the user's own framing of identity, and where it ends vs a neighbor package.
- **North star** — the durable principles; what "good" means for this package.
- **Boundaries** — in scope / explicit non-goals.
- **Direction on the candidate changes** — which assessment/worker items are wanted, deferred, or rejected, and _why_.

Ask, don't assume. Where the user gestures but does not decide, that is an **Open direction**, not a Decision.

## 3. Write the two artifacts as the discussion lands

Write incrementally, as decisions are made — not one dump at the end:

- → `tools/agents/docs/packages/<name>/charter.md`: refine **What it is**; capture **North star**, **Boundaries**, dated blessed **Decisions** (the user's rulings, with the _why_ git can't capture), and remaining **Open directions**.
- → `tools/agents/docs/packages/<name>/assessment.md`: the **Recommended** (sweep-safe) + **Backlog** of possible changes, drawn from the review + worker work + the discussion. Freeze any verbal approval into **Approved** with a provenance stamp (`CONTRACT.md`). Keep design-fork / cross-package items **out** of `Recommended` — they belong in the charter's Open directions.

## Boundaries of this skill

- **ONE package per session.** This is a conversation, not a fan-out.
- `charter.md` and `Approved` are human-gated: write only what the user blessed; **never self-approve**.
- Verify worker claims against the diff before stating them as fact.
- Do **not** write `status.md` (the ingest/review pass owns it) and do **not** write code.
- When a fragment is fully absorbed into the cell, note it for removal (see `index.md`).
