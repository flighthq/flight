# @flighthq/shape — status

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation pruned two modules out of `packages/shape/src/` that the gitignored `dist/` build output proves had existed and compiled. Recovered using the camera pattern: merge `dist/<m>.js` (impl + verbatim `//` comments) with `dist/<m>.d.ts` (types), reconstruct the test from `dist/<m>.test.js`.

### Recovered

- **`shapeHitTestBuiltins`** (`enableShapeHitTesting`) — opt-in registration of default hit-test handlers for the built-in primitive commands `drawCircle`, `drawEllipse`, `drawRectangle`, and `drawRoundRectangle` against the `shapeHitTestRegistry`. Tree-shakable, no module-level side effects. Recovered source + test (15 tests), and added the `export * from './shapeHitTestBuiltins'` line to `src/index.ts` (alphabetized between `shapeFill` and `shapeHitTestRegistry`). Imports only the local registry — no new `@flighthq/types` dependency. All tests green.

### Fossils skipped

- None. Neither lost module implements a deliberately-dropped concept.

### Parked

- **`shapeGraphicsData`** (`appendShapeGraphicsData`, `forEachShapeCommand`, `getShapeGraphicsData`) — genuine lost work (typed read/replay round-trip over the flat `[key, argCount, ...args]` command buffer), but its public seam type `ShapeGraphicsRecord` does not exist anywhere in `packages/types/src/`. Recovery would require editing `@flighthq/types`, which is outside this task's hard boundary. Parked with reason: **needs type `ShapeGraphicsRecord` in `@flighthq/types`**. The `dist/shapeGraphicsData.{js,d.ts,test.js}` build artifacts remain as the recovery spec when the type is added.

### Test result

`npm run test --workspace=packages/shape` — 6 files, 73 tests, all passing.

## 2026-06-25 — builder R2-4 second-pass recovery

Second pass after a parallel types-recovery run. Re-diffed every `dist/*.d.ts` against `src/` and found function-level (not just module-level) drift: two existing source files were missing functions the build output proves had compiled. Recovered them in place plus their colocated tests, merging `dist/*.js` (impl + verbatim `//` comments) with `dist/*.d.ts` (types).

### Recovered

- **`shape.ts`** — added `getShapeBounds` (public allocation-explicit wrapper over `computeShapeLocalBoundsRectangle`), `getShapeCommandCount` (counts command entries, not flat elements), and `isShapeEmpty`. Added their tests to `shape.test.ts` (alphabetized describe blocks). No new `@flighthq/types` dependency.
- **`shapeCommands.ts`** — added `appendShapeArc` (cubic-bezier arc expansion), `appendShapeArcTo` (SVG/Canvas2D tangent-line arc), `appendShapeDrawTriangles` (the headline missing `drawTriangles` command; uses `TriangleCulling`, confirmed present in `@flighthq/types`), `appendShapePolygon` (closed), and `appendShapePolyline` (open). Added the private bottom-of-file helpers `normalizeArcSweep` and `pushArcCubics`. Recovered all matching tests into `shapeCommands.test.ts`.
- **Rename to canonical name** — the first pass restored `appendShapeRoundRectangleVarying` under the name `appendShapeRoundRectanglePath`; the authoritative `dist` build (and the depth review / proposal) name it `appendShapeRoundRectangleVarying`. Renamed source + test to the canonical name (identical body). No external importers of the old name.
- No `src/index.ts` change needed: both files were already exported; only their internal function sets grew.

### Fossils skipped

- None. Every recovered function is genuine graphics/math work (arcs, triangles, polygons, bounds queries), none touching the dropped DisplayObject/Stage/Bitmap/Loader concepts.

### Parked

- **`shapeGraphicsData`** (`appendShapeGraphicsData`, `forEachShapeCommand`, `getShapeGraphicsData`) — still parked. The parallel types-recovery pass did **not** restore `ShapeGraphicsRecord`; it remains absent from `packages/types/src/` (no `ShapeGraphicsRecord.ts`, no matching export, no `GraphicsData`/`GraphicsRecord` alias anywhere in the header layer). Recovery would require editing `@flighthq/types`, outside this task's hard boundary. Parked with reason: **needs type `ShapeGraphicsRecord` in `@flighthq/types`**.

### Test result

`npm run test --workspace=packages/shape` — 6 files, 92 tests, all passing.
