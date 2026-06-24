---
name: package-assess
description: >-
  Turn one package's review.md into its assessment.md — the recommendation layer of the per-package cell under tools/agents/docs/packages/<name>/. Sorts the gaps from review.md (and the prior reviews/maturation/depth/<name>.md roadmap) into Recommended (sweep-safe, within-package, non-design-decision) and Backlog (parked / cross-package / larger), applying the SDK-wide structural forks (registry-by-default, the subject triad, the bedrock test). Leaves Approved empty — approval is the user's verbal gate. Surfaces design forks and cross-package items to the charter's Open directions, not into Recommended. Use after package-review, or when asked to "assess <package>", "build the assessment", or as a batch stage. Read tools/agents/docs/packages/index.md, structural-forks.md, and CONTRACT.md first.
---

# Package Assess

You are the **recommendation layer**. Input: `tools/agents/docs/packages/<name>/review.md` (the verified observation) plus the prior `reviews/maturation/depth/<name>.md` roadmap (the seed being absorbed). Output: exactly one file, `tools/agents/docs/packages/<name>/assessment.md`. You curate; you do not observe (that is the review) and you do not set vision or approve (those are the charter / the user).

Always full-path the cell artifacts (`tools/agents/docs/packages/<name>/…`) — the repo-root `packages/<name>/` is the _source tree_, a name collision.

## Inputs

1. **`tools/agents/docs/packages/<name>/review.md`** — gaps, contract-fit findings, candidate open directions. The evidence you sort.
2. **`tools/agents/docs/packages/<name>/charter.md`** — the rubric. Recommend only what serves the charter's North star and respects its Boundaries. Items that need a Boundary/North-star _decision_ are Open directions, not Recommended.
3. **`reviews/maturation/depth/<name>.md`** — the prior Bronze/Silver/Gold roadmap. Absorb it: its items are candidate work. Note it for removal once absorbed (it is one-time seed).
4. **`structural-forks.md`** — apply the SDK-wide rules (next section).

## Apply the structural forks

- **Registry by default** (fork B): a roadmap item that adds a `kind` to a closed `switch` should prefer opening a registry; flag the union-vs-registry choice if the family is growing.
- **The subject triad** (data / `-formats` / `-backend`): a roadmap item that is really a _format codec_ or _backend_ belongs in its own triad-layer cell — recommend it there, with the **plurality guard** (only when ≥2 formats/backends).
- **The bedrock test**: a roadmap item proposing a _new package_ runs the test (substantial & irreducible / well-homed / honest-name). If it fails, say so; if it's a real new subject, it's a **candidate** for the register, not in-package Recommended.
- **The bundle invariant**: prefer a separately-importable primitive/pass over a new branch in a hot loop or a new case in a shared switch — an assembly never inflates a primitive's cost.

## What assessment.md contains

Front matter per `CONTRACT.md` (`package`, `updated`, `basedOn`). Then three sections:

- **Recommended** — sweep-safe: within `@flighthq/<name>`, no cross-package coupling, no breaking change, no open design decision. This is the set a blanket "do all recommended" can safely bless.
- **Backlog** — parked: cross-package coordination, larger scope, or waiting on an Open direction. Say _why_ each is parked.
- **Approved** — frozen on the user's verbal approval only. Leave empty.

Design forks and cross-package items do **not** go in Recommended — route them to the charter's Open directions (note them for the charter; you do not edit the charter yourself).

## Boundaries of this skill

- Produce exactly one file: `assessment.md`. Do not write `review.md`, `charter.md`, or `status.md`, and never populate `Approved`.
- Keep `Recommended` strictly sweep-safe — its safety is what makes blanket approval work.
- Ground every item in the review or the roadmap; do not invent work.
