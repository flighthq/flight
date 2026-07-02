---
package: '@flighthq/path-boolean'
crate: flighthq-path-boolean
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# path-boolean — Charter

## What it is

`@flighthq/path-boolean` is a **neighbor package** of `@flighthq/path` for constructive solid geometry (CSG) boolean operations on 2D paths: union, intersection, difference, xor. A `-subpackage` suffix package that keeps the boolean kernel tree-shakable from the core path package.

Blessed as a new package during the path direction session (2026-07-02).

_(Needs a full direction session to design the API surface and algorithm choice.)_

## North star

_TODO — needs direction session._

## Boundaries

_TODO — needs direction session._

## Decisions

_Append-only, dated, blessed rulings. None recorded yet — package is pre-direction._

### Origin decisions (from path charter)

- **[2026-07-02 · path charter]** `path-boolean` approved as a neighbor package of path. Keeps CSG operations tree-shakable from core path.

## Open directions

1. **Algorithm choice.** Greiner-Hormann, Martinez-Rueda, or another approach? Robustness vs simplicity trade-off.
2. **API shape.** `unionPaths(a, b, out?)`, `intersectPaths(a, b, out?)`, etc.? Or a single `booleanPathOperation(a, b, op, out?)`?
3. **Winding rule interaction.** How do boolean ops interact with fill rules (even-odd vs non-zero)?
