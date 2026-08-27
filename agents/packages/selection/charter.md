---
package: "@flighthq/selection"
role: package
crate: flighthq-selection
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# selection — Charter

> Durable vision and core values for `@flighthq/selection`. You author this (via an agent
> transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged
> against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

A standalone selection model over scene-graph nodes: ordered selection state, active identity,
standard pointer mutation policy, and caller-driven marquee and lasso queries.

## North star

Composable state and query primitives that work across graph families. Selection identity depends
only on hierarchy membership; geometric queries add only the bounds feature they require. The
package owns no interaction controller or presentation.

## Boundaries

In scope: ordered-set mutation and queries, active-node tracking, change signals, standard pointer
policy, gesture geometry state, and candidate-list marquee/lasso queries.

Out of scope: visuals, editor application state, pointer dispatch, transform gizmos, movement,
clipboard behavior, eligibility/locking policy, hierarchy traversal policy, and scene-tree
synchronization.

## Decisions

- 2026-08-27 — Package-only delivery; no editor application or selection visuals.
- 2026-08-27 — Selection identity is typed on `HierarchyNode`; geometric candidate queries add
  `BoundsNode` only at their seam; `Node2D` is not part of the API.
- 2026-08-27 — The package has exactly public and contract lanes, exports no package-owned types,
  performs no top-level registration, and declares `sideEffects: false`.

## Open directions

None.
