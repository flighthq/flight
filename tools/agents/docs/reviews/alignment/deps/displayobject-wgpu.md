# Dependency Alignment: @flighthq/displayobject-wgpu

**Verdict:** Clean — dependency set is minimal, correct, and identical to its `displayobject-gl` sibling; no `@flighthq/sdk` import, no inline cross-package types, no phantom or boundary violations; the only judgment note is `@flighthq/sprite` being value-imported in tests only (consistent with the GL backend, acceptable).

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Info | `@flighthq/displayobject-canvas` | A WebGPU backend depending on the Canvas backend reads as a surprising "backend → backend" edge, but it is intentional: both GPU backends reuse `renderCanvasShapeCommands` / `mapCanvasScale9ShapeCommands` (shape-command tessellation source-of-truth owned by the Canvas package). `displayobject-gl` has the same edge. | None. Consistent and deliberate. (Optional future cleanup: if shape-command generation were promoted out of `displayobject-canvas` into a shared `shape`/`path` home, all three would shed this edge — a cross-package design call, not a fix for this package.) |
| Info | `@flighthq/sprite` | Declared in `dependencies` but value-imported (`createSprite`, `createTilemap`, `createParticleEmitter`, `createQuadBatch`) **only in `*.test.ts`**. Non-test src consumes sprite _types_ via `@flighthq/types`, never `@flighthq/sprite`. So at production runtime this package imports no value from `sprite`. | Acceptable as-is: the renderer's purpose is to render sprite-graph nodes, the entity package is its conceptual peer, and it is genuinely needed to build/run the colocated tests in-workspace. Identical to `displayobject-gl`. Could be argued into `devDependencies`, but keeping it in `dependencies` matches the sibling and the package's role; do not split unless the whole backend family is changed together. |
| Info | `@webgpu/types` (dev) | Correctly a `devDependency`: `GPU*` types are used across 11 src files but are ambient compile-time types only, contributing no runtime weight. | None. |

No issues found for: `@flighthq/sdk` import (none), inline cross-package types (none — exported types `WgpuShapeMesh`, `WgpuQuadBatchResources`, `WgpuRichTextOverlay` are backend-local, `Wgpu`-prefixed, correctly not in `@flighthq/types`), workspace pinning (all `"*"`), `"sideEffects": false` (set), layering (renderer → `render` core + `render-wgpu` core; no reach across to `render-gl`/`render-canvas` core), tree-shaking. `npm run packages:check` passes (86 packages valid).

## Declared vs used

**Unused declared (not value-imported in non-test src):**

- `@flighthq/sprite` — value-imported in tests only; non-test src uses sprite types via `@flighthq/types`. Retained intentionally (see Findings); not a true unused dep.

All other declared deps are value-imported in non-test src and confirmed used: `@flighthq/displayobject` (2), `@flighthq/displayobject-canvas` (3), `@flighthq/geometry` (1), `@flighthq/materials` (3, `computeRgbHexString`), `@flighthq/node` (5), `@flighthq/path` (1, `tessellatePath`), `@flighthq/render` (10), `@flighthq/render-wgpu` (41), `@flighthq/shape` (1, `getShapeFillRegions`), `@flighthq/text` (2), `@flighthq/textinput` (1), `@flighthq/textlayout` (3), `@flighthq/types` (35), `@flighthq/velocity` (1, `getVelocity`).

**Phantom (used but undeclared):** None. Every `@flighthq/*` imported anywhere in src (including tests) is declared.
