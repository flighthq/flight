---
package: '@flighthq/path-formats'
crate: flighthq-path-formats
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# path-formats — Charter

## What it is

`@flighthq/path-formats` is a **neighbor package** of `@flighthq/path` for path serialization/deserialization formats: SVG path data (`d` attribute), Canvas2D path recording, and potentially other path exchange formats. A `-subpackage` suffix package that keeps codec concerns tree-shakable from the core path package.

Blessed as a new package during the path direction session (2026-07-02).

_(Needs a full direction session to design the format roster and API surface.)_

## North star

_TODO — needs direction session._

## Boundaries

_TODO — needs direction session._

## Decisions

_Append-only, dated, blessed rulings. None recorded yet — package is pre-direction._

### Origin decisions (from path charter)

- **[2026-07-02 · path charter]** `path-formats` approved as a neighbor package of path. Keeps codec/serialization tree-shakable from core path.

## Open directions

1. **Format roster.** SVG path data is the clear first target. Canvas2D path recording? PostScript? Custom binary?
2. **API shape.** `parseSvgPathData(d: string): Path`, `serializeSvgPathData(path: Path): string`? Round-trip fidelity requirements?
3. **Error handling.** Malformed SVG path data — sentinel (null) or best-effort partial parse?
