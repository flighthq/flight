---
package: '@flighthq/shape'
updated: 2026-08-13
by: builder4
---

# shape — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/shape/src/` on 2026-08-08.

- **`drawTriangles` is missing from the header registry.** `ShapeCommandRegistry`
  (`types/src/ShapeCommand.ts:19-78`) has no `drawTriangles` key, so `ShapeCommandKey` excludes it — yet
  the vocabulary emits it (`shapeCommands.ts:215`) and both consumers decode it (`shape.ts:257`,
  `shapeFill.ts:163`). The header layer lags the buffer.
- **The typed round-trip is chartered and unbuilt.** No `shapeGraphicsData.ts`, and a repo-wide grep
  finds no `getShapeGraphicsData`, `forEachShapeCommand`, `appendShapeGraphicsData`, or
  `ShapeGraphicsRecord`. `@flighthq/shape-formats` meanwhile hand-rolls its own raw-buffer walk — a
  second decoder this surface would subsume.
- **The 2026-07-02 correctness fixes still have no behavioral tests.** `shape.test.ts` contains zero
  occurrences of `drawPath`, `lineStyle`, or `drawTriangles`, so the `drawPath` verb decoding, the
  per-span stroke expansion, and the triangle vertex sweep in `computeShapeLocalBoundsRectangle` are
  verified only by reading source. `shapeFill.test.ts` likewise asserts no per-`drawPath` winding carry
  (no `evenOdd` case at all) and no `drawTriangles`-with-`uvtData` non-solid case (the branch is
  `shapeFill.ts:163`).
- **KAPPA diverges between the two packages.** `shape/src/shapeFill.ts:183` has `0.5522847498307936`;
  `path/src/path.ts:366` has `0.5522847498308936`. Shape's is the correct 4(√2−1)/3 — path's digit is
  wrong. There is no shared constant home for the curve-approximation constants.
- **`appendShapeArcTo` rescans the whole command buffer per call** to recover the pen position
  (`shapeCommands.ts:62-82`), making a run of arcs O(n²). Pen state has no home — a runtime slot or an
  explicit parameter is the API-shape decision.
- **`appendShapePolygon` silently drops the trailing element of an odd-length array**
  (`shapeCommands.ts:304`: `k < points.length - 1` stepping by 2). Degenerate-input policy — odd-length
  arrays, zero/negative radius, NaN — is still unblessed.
- **There is no `crates/` directory in this repo.** The `crate: flighthq-shape` stamp points at the
  separate flight-rs repo, not at work reachable from this tree.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-20** — Three DOM functional scenes (`shape-stroke-joints`, `node-blend-modes`,
  `node-blend-modes-advanced`) were missing `registerDefaultShapeBoundsCommands()`. Hashes unchanged
  because the global registry was populated by other scenes in the same capture process. Interaction
  zero-coverage noted in `agents/packages/interaction/status.md`.
- **2026-08-13** — Shape bounds moved from the closed command switch to explicit process-wide command
  contributions paired with Canvas draw registration; fill-only and ink traversals share the registry,
  adjacent segment summaries resolve miter/CLOSE geometry, registry revision invalidates cached bounds,
  and missing keys have a sentinel/explanation/opt-in guard instead of an invented rectangle. Cubic extrema
  now preserve axes rather than pinning the old swap in the fixture.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The standing charter contradiction checked
  out **false**: "Decision #4 (Shape should depend on `@flighthq/path`) is not implemented —
  `package.json` has no path dependency" is dead, `@flighthq/path` is a declared dependency and the
  stroke path composes over it. Three more died with it: `@flighthq/geometry` is no longer test-only
  (`morphShapePaint.ts:1` uses it in production), Scale-9 is no longer behavior-free
  (`mapScale9ShapeCommands`, `scale9ShapeCommands.ts:9`), and the whole hit-test block — the false
  `enableShapeHitTesting` doc comment, the round-rect radius integer-truncation, "builtins cover
  primitives only" — is moot because `shapeHitTestRegistry.ts` and `shapeHitTestBuiltins.ts` no longer
  exist. The 2026-06-25 "live source is the leaner set, the arc/polygon surface does not exist" entry is
  also long superseded: `appendShapeArc`/`ArcTo`/`Polygon`/`Polyline` are all in `shapeCommands.ts`.
- **2026-08-05** — Shape command storage gained typed tokens and safe large-buffer copying; the
  superseded per-command hit-test registry was removed.
- **2026-08-02** — Compound MorphShape geometry and paint: multiple independently prepared path morphs
  and stable in-place paint bindings share one progress value, sampled before a single content
  invalidation; structural style and texture identity stay static.
- **2026-08-02** — `MorphShapeAnimationTarget`, `applyAnimationClipToMorphShape`, and the reusable
  `applyMorphShapeAnimationSample` visitor added; advancement stays caller-owned and the animation core
  stays target-free.
- **2026-08-02** — `MorphShapeKind` and the retained MorphShape entity/runtime family over a prepared
  `PathMorph`; all four backends publish default MorphShape renderer aliases reusing their Shape
  command renderer.
- **2026-07-13** — Review pass: solid/82, with the gap to authoritative being unfinished approved work
  plus test debt rather than defective code.
- **2026-06-24** — Exact analytic bounds (cubic derivative roots, per-span stroke expansion, triangle
  sweep), winding-honoring solid fill regions, and the full append vocabulary landed.
