---
package: "@flighthq/gui"
role: package
crate: flighthq-gui
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# gui — Charter

> Durable vision and core values for `@flighthq/gui`. No session status lives here; see status.md.

## What it is

A controller-only behavioral layer that wires caller-authored `Node2D` visuals into standard user
interface interactions without creating, owning, laying out, or rendering those visuals.

## North star

Explicit visuals plus explicit behavior: every controller is independently importable, uses the
interaction and signal contracts, changes only the supplied parts, and releases every listener and
reference on disposal.

## Boundaries

In scope: standard widget state machines, input wiring, signals, local repositioning of supplied parts,
direct property assignment by default, and caller-injected transition adapters.

Out of scope: visual creation, themes, rendering, layout resolution, scene documents, editor/app/panel/
project/file state, and an unconditional tween runtime.

## Decisions

- 2026-08-27 — Package-only controller delivery; no editor application or visual ownership.
- 2026-08-27 — Transitions are opt-in descriptors; direct property assignment is the default and the
  package has no tween dependency.
- 2026-08-27 — SplitPane and TreeView are distinct behavior primitives. ColorPicker and PropertyGrid
  are compositions documented as examples, not controllers.
- 2026-08-27 — Each controller remains tree-shakable independently; importing Button must not pull the
  rest of the catalog.

## Open directions

None.
