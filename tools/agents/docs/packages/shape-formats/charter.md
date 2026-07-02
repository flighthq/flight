---
package: '@flighthq/shape-formats'
crate: flighthq-shape-formats
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# shape-formats — Charter

## What it is

`@flighthq/shape-formats` is a **neighbor package** of `@flighthq/shape` for shape serialization/deserialization formats. A `-subpackage` suffix package that keeps codec concerns tree-shakable from the core shape package.

Blessed as a new package during the shape direction session (2026-07-02).

_(Needs a full direction session to design the format roster and API surface.)_

## North star

_TODO — needs direction session._

## Boundaries

_TODO — needs direction session._

## Decisions

_Append-only, dated, blessed rulings. None recorded yet — package is pre-direction._

### Origin decisions (from shape charter)

- **[2026-07-02 · shape charter]** `shape-formats` approved as a neighbor package of shape.

## Open directions

1. **Format roster.** What shape serialization formats are needed?
2. **API shape.** Serializer/deserializer function naming.
3. **Relationship to path-formats.** Shapes contain paths — how do the two formats packages interact?
