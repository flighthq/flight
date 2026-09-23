---
package: '@flighthq/scene2d-canvas'
status: solid
score: 84
updated: 2026-09-23
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - package.json
  - assessment.md
---

# scene2d-canvas — Review

## Verdict

`solid — 84/100`. The package is a coherent Canvas 2D realization of the shared render contracts. It
has explicit host-backed surface ownership, state-owned copy-on-write registries, balanced render-pass
brackets, deterministic teardown, and a plain preset assembly. The prior review's central
description was obsolete: the public assembly is now the plain `canvasScene2DRenderPreset`, not a
`CanvasPipeline` Entity, and it contains 13 renderers rather than 12.

The remaining distance to authoritative is concentrated in fidelity and conformance rather than basic
architecture: Video is absent despite the charter, shape replay still allocates per draw, some stroke
semantics are not represented, and no cross-backend pixel-conformance scenes prove the implementation.

## Current architecture

- `canvasScene2DRenderPreset` is a frozen `CanvasRenderRegistries` aggregate. It registers BitmapText,
  DisplayObject, MorphShape, ParticleEmitter2D, QuadBatch, RenderCache, RichText, Scale9Shape,
  Scale9Sprite, Shape, Sprite, TextLabel, and Tilemap renderers, plus the blend policy and shape-command
  table. Callers may derive or replace individual maps without an Entity wrapper.
- `createCanvasRenderState` clones all supplied registry maps into its runtime. Registrars therefore
  change one state without mutating the shared preset, while the public `registries` view continues to
  observe the live runtime aggregate.
- Canvas allocation is an explicit capability seam. `registerCanvasHost` installs a
  `HostCanvasCapability`; `acquireCanvasSurface` records the allocating host; and
  `destroyCanvasSurfaceOwned` returns each surface to that same host exactly once.
- Render targets and nested render passes separate drawing policy from destination. Texture targets,
  render textures, cache targets, texture resolvers, clipping, materials, effects, and text input all
  retain explicit lifecycle or opt-in boundaries.
- Alpha and image-smoothing writes use runtime shadows. Per-axis `LineScaleMode` is carried by
  `CanvasShapeDrawState` and resolved at stroke flush, including `normal`, `none`, `horizontal`, and
  `vertical`.
- The package has 49 implementation files and 49 colocated test files after excluding its two barrels.
  Tests cover the host seam, state isolation, pass nesting, renderer coverage, texture ownership, and
  the individual draw paths. These are strong contract tests, but they do not establish rendered-pixel
  parity with other backends.

## Gaps

- `renderCanvasShapeCommands` creates a fresh `CanvasShapeDrawState` and its `flush` closure for every
  shape draw. This remains a hot-path allocation.
- `lineStyle` carries and implements `scaleMode`, but still ignores `pixelHinting`. The command data has
  no dash pattern or offset and production code never calls `setLineDash`, so dashed strokes remain an
  upstream shape/type design gap.
- The preset has no Video renderer even though the charter promises one for every listed display-object
  kind. The implementation or the charter must change.
- Public Canvas render types still expose `HTMLCanvasElement` and `CanvasRenderingContext2D` handles.
  Surface creation is host-seamed, but the draw-facing contracts remain browser-specific; that is
  consistent with `crate: null` today and should stay an explicit portability boundary.
- There are no functional pixel-conformance scenes for blend behavior, line scaling, scale-9, smoothing,
  filters, or cache/render-texture composition. Unit tests validate calls and state, not visual output.

## Charter fit

The leaf-backend boundary, explicit registration, types-first policy, and host-web-only Rust posture are
all upheld. Two charter passages have drifted: the in-scope section still names the retired
`CanvasPipeline` / `scene2dCanvasPipeline` API, and the kind list promises Video while the preset does
not. The charter is direction-owned, so this review records the contradictions without rewriting it.

The existing assessment is also historical. Its per-axis line-scale and smoothing-restoration work has
landed, while its conformance, dash, and readback/design items remain useful backlog. The append-only
Approved section was not changed by this review.

## Export review

The public export change is internally consistent with the new host seam:
`acquireCanvasRenderSurface`, `createCanvasRenderSurface`, `destroyCanvasRenderSurface`, and
`registerCanvasSurfaceCreator` were replaced by `acquireCanvasSurface`,
`destroyCanvasSurfaceOwned`, `getCanvasHost`, `getCanvasSurfaceHost`, and `registerCanvasHost`. The
refreshed export snapshot records that reviewed surface rather than accepting unrelated unsnapshotted
packages.
