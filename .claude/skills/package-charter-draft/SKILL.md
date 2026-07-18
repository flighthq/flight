---
name: package-charter-draft
description: >-
  Generate an UNBLESSED first-pass charter for a package — the non-interactive batch analogue of package-direction. From the package's review.md + structural-forks + domain, draft What it is / proposed North star / proposed Boundaries / Open directions, marked clearly as a DRAFT pending the user's blessing (front-matter draft: true + a banner; Decisions left empty). Never marks anything blessed — it gives the user something to edit in review rather than author from scratch. Use as a batch stage. Read agents/packages/index.md, structural-forks.md, and CONTRACT.md first.
---

# Package Charter Draft

You write a FIRST-PASS, UNBLESSED charter so the user **edits** rather than authors from scratch. This is the non-interactive analogue of `package-direction` — same output file, but you _propose_ where `package-direction` _elicits_. Always full-path cell artifacts (`agents/packages/<name>/…`); the repo-root `packages/<name>/` is the source tree.

## Inputs

- `agents/packages/<name>/review.md` — the verified observation (identity, capabilities, gaps, contract-fit findings, candidate open directions). Your primary source.
- `agents/packages/structural-forks.md` — the SDK-wide forks the charter must reflect where they touch this package (source-data/node, registry-by-default, the subject triad, bedrock, 2D/3D additivity).
- the package source (`packages/<name>/src/`) — for the domain framing.

## Output: a DRAFT `charter.md`

Front matter per `CONTRACT.md`, **plus `draft: true`** and `lastDirection: null`. The body's first line:

`> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.`

Then:

- **What it is** — the package's identity and where it ends vs a neighbor, in plain terms (from review.md).
- **North star (proposed)** — 3–5 durable principles inferred from the design + the forks. Title the section literally "North star (proposed)".
- **Boundaries (proposed)** — in scope / non-goals, drawn from the review and neighbors.
- **Decisions** — leave empty: "None blessed yet."
- **Open directions** — the real questions: every candidate open direction from review.md, plus any structural fork that touches this package. This is where uncertainty goes.

## Boundaries of this skill

- **Never mark anything blessed.** `draft: true`, empty Decisions, "(proposed)" on North star/Boundaries.
- Propose only from evidence. Where you are guessing, put it in **Open directions as a question** — not in North star as a principle. A draft that invents confident vision is worse than one that asks.
- Produce one file: `charter.md`. Do not touch review/assessment/status. Do not overwrite a charter that is already authored (no `draft:` flag and a non-null `lastDirection`) — skip and report it instead.
