---
package: "@flighthq/gizmo"
role: package
crate: flighthq-gizmo
lastDirection: 2026-08-27
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# gizmo — Charter

> Durable vision and core values for `@flighthq/gizmo`. No session status lives here; see status.md.

## What it is

A standalone transform-gizmo controller that presents fixed semantic handles in a dedicated 2D
overlay and emits caller-applied translation, rotation, and scale deltas for generic scene-graph
selection identities.

## North star

One selection-preserving transform seam across graph families: `HierarchyNodeAny` remains generic
through every exported API, graph-specific geometry arrives through explicit feature callbacks, and
future 3D support extends the feature family without rewriting existing selection code.

## Boundaries

In scope: translate/rotate/scale modes, local/world axes, center/origin/custom pivots, snapping,
multi-selection bounds, constant-screen-space overlay presentation, explicit per-frame updates,
interaction lifecycle, and transform signals.

Out of scope: editor/application state, undo commands, rendering backends, scene documents, themes or
skinning, caller-node mutation, and 3D implementation.

## Decisions

- 2026-08-27 — Package-only 2D delivery; no editor, command, render, scene-document, or 3D coupling.
- 2026-08-27 — Selection generics are preserved through `NodeType extends HierarchyNodeAny`; a
  caller-supplied feature seam provides world bounds, origin, and rotation.
- 2026-08-27 — The gizmo owns fixed-semantic, non-skinnable overlay handles as an accepted package
  cost.
- 2026-08-27 — Every `onRotate` value is authoring-layer degrees, never geometry-layer radians.
- 2026-08-27 — Tree-shaking evidence includes exact size, named failure markers, and a dedicated
  import-leakage regression test.

## Open directions

None.
