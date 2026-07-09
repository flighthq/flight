---
package: '@flighthq/path-formats'
crate: flighthq-path-formats
draft: false
lastDirection: 2026-07-09
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# path-formats — Charter

## What it is

`@flighthq/path-formats` is a **neighbor package** of `@flighthq/path` for path serialization/deserialization formats: SVG path data (`d` attribute), Canvas2D path recording, and potentially other path exchange formats. A `-subpackage` suffix package that keeps codec concerns tree-shakable from the core path package.

Blessed as a new package during the path direction session (2026-07-02). Directed 2026-07-09 (first-build scope = SVG path data).

## North star

The tree-shakable codec neighbor of `@flighthq/path`: interchange a `Path` with external string/data formats without the core path package carrying any parser weight. A caller that never touches SVG never pays for SVG. Round-trips are lossless where the formats allow it (`Path` → SVG `d` → `Path` preserves geometry).

## Boundaries

- **Codec only.** Turns a `Path` into a format string and back, using the `@flighthq/path` builders (`appendPath*`) and `forEachPathSegment`. It owns no geometry math (flatten, bounds, hit-test, boolean) — that is `@flighthq/path`.
- **Depends on `@flighthq/path` + `@flighthq/types`.** No DOM, no renderer.
- **Formats are independently tree-shakable** — each format's parse/format pair is its own module, so unused formats drop out.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-09] First-build scope = SVG path data (`d`).** `parseSvgPathData(d): Path | null` and `formatSvgPathData(path, options?): string`, supporting the full SVG path grammar (`M/L/H/V/C/S/Q/T/A/Z` + relative lowercase + implicit repeated commands + the `S`/`T` smooth shorthands). Serialization emits absolute commands; `formatSvgPathData` takes optional coordinate precision. Canvas2D recording and other formats are deferred.
  **Why:** SVG path data is the canonical, highest-demand interchange format and round-trips cleanly against the `Path` builders; other formats are additive later with no design change.
- **[2026-07-09] `format*`/`parse*` naming pair** (matching `formatSurfaceFingerprint`/`parseSurfaceFingerprint`), keyed by the format in the name (`*SvgPathData`), not a generic `serialize`.
- **[2026-07-09] Parse returns a sentinel `null` on malformed input** (not a throw, not a silent partial) — a structurally invalid `d` (bad command letter, missing required coordinates) yields `null`; well-formed input parses fully.

### Origin decisions (from path charter)

- **[2026-07-02 · path charter]** `path-formats` approved as a neighbor package of path. Keeps codec/serialization tree-shakable from core path.

## Open directions (deferred)

1. **Canvas2D path recording** — replay a `Path` onto a `CanvasRenderingContext2D`/`Path2D`, and record from one.
2. **Other formats** — PostScript, a compact binary, etc., as demand appears.
