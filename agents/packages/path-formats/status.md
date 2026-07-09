---
package: '@flighthq/path-formats'
updated: 2026-07-09
---

# path-formats — Status

Direction session held 2026-07-09 (see charter Decisions: first-build scope = SVG path data). First implementation shipped.

## Shape

Package `@flighthq/path-formats` depends on `@flighthq/path` + `@flighthq/types`. Single module `svgPathData.ts` (colocated `svgPathData.test.ts`), three exports:

- `parseSvgPathData(d: string): Path | null` — parses the full SVG path grammar (`M L H V C S Q T A Z`, relative lowercase, implicit repeated commands, `S`/`T` smooth shorthands) into a fresh `Path` via the `appendPath*` builders. `null` on structurally malformed input (leading non-moveto, unknown command letter, missing/short coordinate run); empty/whitespace-only input yields an empty path.
- `formatSvgPathData(path: Readonly<Path>, options?: Readonly<{ precision?: number }>): string` — serializes a `Path` to absolute-command `d` text by walking `forEachPathSegment`. `precision` rounds coordinates to N decimals (trailing zeros trimmed); default is full precision.
- `appendSvgPathData(path: Path, d: string): boolean` — parses into an existing path; `false` on malformed. `parseSvgPathData` is a thin wrapper over it.

Tokenizer is a context-aware hand-written scanner (not a regex token stream): comma/whitespace separators, signs, decimals, scientific notation, no-space-before-negative (`10-5`), and single-char arc flags that may be packed with no separator (`0110`).

Segment-kind → SVG-command mapping (format side): `moveTo`→`M`, `lineTo`→`L`, `curveTo` (quadratic)→`Q`, `cubicCurveTo`→`C`, `close`→`Z`. There is no arc `PathSegment` kind — `@flighthq/path` stores arcs as cubic beziers (via `appendPathArcTo`) — so `formatSvgPathData` never emits `A`. Round-trips preserve geometry; an `A` input re-emits as `C`.

1 source file, colocated tests (25 tests). Package registered in `tsconfig.base.json`, `tsconfig.build.json`, and the `@flighthq/sdk` barrel/manifest/tsconfig. `npm run check` (packages/typecheck/lint/format/order/exports/api), path-formats tests, and typecheck all green.

## Next

Deferred formats (see charter Open directions), additive with no design change:
- **Canvas2D path recording** — replay a `Path` onto a `CanvasRenderingContext2D`/`Path2D` and record from one.
- **Other formats** — PostScript, a compact binary, etc., as demand appears.

Known limitation: an SVG arc (`A`/`a`) that immediately follows a `Z`/`z` without an intervening moveto relies on `appendPathArcTo` reading the path's last emitted data point as the arc start, which after a close is the pre-close anchor rather than the subpath origin. Valid SVG almost always has a moveto after `Z`, so this corner is untested and left as-is.
