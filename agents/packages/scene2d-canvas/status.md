---
package: '@flighthq/scene2d-canvas'
updated: 2026-09-23
by: auditor
---

# scene2d-canvas — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/scene2d-canvas/src/` and its public types on 2026-09-23.

- **Shape replay still allocates per draw.** `renderCanvasShapeCommands` creates a fresh
  `CanvasShapeDrawState` and `flush` closure for every shape.
- **Stroke fidelity is incomplete.** `lineStyle` now carries and implements all four `LineScaleMode`
  values, but ignores `pixelHinting`. The command tuple has no dash pattern or offset, and production
  code never calls `setLineDash`.
- **Video is missing from the preset.** `canvasScene2DRenderPreset` registers 13 renderer kinds,
  including Scale9Sprite, but no Video renderer; the charter still promises Video.
- **The draw contracts remain browser-specific.** Surface allocation is host-seamed, while
  `CanvasRenderState`, `CanvasRenderTarget`, and `CanvasRenderPass` still expose
  `HTMLCanvasElement` / `CanvasRenderingContext2D` handles. This is consistent with `crate: null`, but
  remains an explicit portability boundary.
- **Pixel parity is unproved.** No functional conformance scenes compare blend, line-scale, scale-9,
  smoothing, filter, cache, or render-texture output with other backends.
- **The charter names a retired assembly.** Its boundary text still describes a `CanvasPipeline`
  Entity and `scene2dCanvasPipeline`; source now exposes the plain `canvasScene2DRenderPreset`.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-09-23** — Re-audited the package after the host seam: recorded `canvasScene2DRenderPreset`
  (13 renderers), direct `HostCanvasCapability` surface ownership, implemented per-axis line scaling,
  runtime-managed smoothing, and the remaining fidelity/conformance gaps.
- **2026-08-30** — `CanvasPipeline` Entity landed (pipeline entity doc backfill): `createCanvasPipeline`, `createEmptyCanvasRegistries`, `getCanvasPipelineRegistries`, `canvasShapeCommandTable`, and `scene2dCanvasPipeline` const (12 renderers, native blend policy, 16 shape commands). `@flighthq/entity` promoted to dependency.
- **2026-08-13** — Canvas Shape command registration now structurally pairs draw and bounds contributions,
  forwarding backend-neutral geometry into `@flighthq/shape`. Invalid/nonfinite line widths and miter limits
  normalize at replay to deterministic Canvas defaults, eliminating prior-Shape context leakage.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The 2026-06-24 headline — "`LineScaleMode
  'none'` implemented; `strokeScaleMode` added to `CanvasShapeDrawState`" — is **false**: `strokeScaleMode`
  has zero occurrences anywhere in `packages/`, and `canvasLineStyle` never reads `buf[i+4]`. Also
  dropped as false: the blend-mode fidelity list (`BlendMode.Erase`/`Alpha`/`Invert`/`Shader`/`Subtract`
  are no longer enum members — `packages/types/src/BlendMode.ts` is the cheap fixed-function set only,
  with Porter-Duff moved to `CompositeEffect`); the `enable*Support` naming unification (the real names
  are `enableCanvasRenderCache` and `enableCanvasTextInput`, no suffix); the
  `registerCanvasDisplayObjectRenderers` umbrella and `canvasRegistration.ts`, which no 2D backend now
  has; the module-level scratch
  `_drawState`; and the render-target readback item, since `createBitmapFromCanvas`
  (`packages/bitmap/src/bitmapFrom.ts:28`) reads back the plain `CanvasRenderTarget.canvas` — the
  ownership boundary it called unresolved is settled in `@flighthq/bitmap`'s favor.
- **2026-06-25** — Added degenerate-input no-throw cases to `canvasShape.test.ts` /
  `canvasParticleEmitter2D.test.ts`; three of four swept items parked on stale premises.
- **2026-06-24** — Builder pass claiming a registration umbrella, blend-mode fidelity fixes, naming
  unification, `LineScaleMode 'none'`, and a scratch draw state. Only `destroyCanvasRenderTarget` and
  `destroyCanvasRenderCacheTarget` survive in source (`canvasRenderTarget.ts`, `canvasCache.ts`).
