---
package: '@flighthq/scene2d-canvas'
updated: 2026-08-08
by: principal
---

# scene2d-canvas — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/scene2d-canvas/src/` on 2026-08-08. A file:line here is a claim about this
tree, not about a session.

- **`lineStyle` drops two of its eight arguments.** `defaultCanvasLineStyle`
  (`canvasShapeCommands.ts:315-333`) reads thickness/color/alpha at `buf[i..i+2]` and
  caps/joints/miterLimit at `buf[i+5..i+7]`, skipping `pixelHinting` (`buf[i+3]`) and `scaleMode`
  (`buf[i+4]`). `CanvasShapeDrawState` (`packages/types/src/CanvasShapeDrawState.ts`) has no
  `strokeScaleMode` field, so there is no carrier to reach `flushCanvasShapePath` even if it were read:
  all four `LineScaleMode` values render identically. Adding the field is a `@flighthq/types` change.
- **Dashed strokes cannot be expressed at all.** The `lineStyle` tuple
  (`packages/types/src/ShapeCommand.ts:65-74`) carries no dash fields, and no canvas source calls
  `setLineDash`. `@flighthq/path` already has a full dash kernel (`path/src/dashPath.ts`) that the
  shape command buffer has no way to reach.
- **Every image-smoothing toggle restores to a hard-coded `true`, not the configured default.**
  `canvasSprite.ts:33`, `canvasTilemap.ts:61`, `canvasParticleEmitter2D.ts:67`,
  `canvasBitmapText.ts:67`, and `canvasQuadBatch.ts:91` all set `imageSmoothingEnabled = true` on the
  way out, while `createCanvasRenderState` honors `options.imageSmoothingEnabled`
  (`canvasRenderState.ts:63`). A state created with smoothing off silently gets it back after the first
  nearest-filter draw. `createBitmapPattern` and
  `resolveCanvasTextureWindowSource` set it with no restore at all.
- **`renderCanvasShapeCommands` allocates a `CanvasShapeDrawState` per shape draw**
  (`canvasShape.ts:43`), including its `flush` closure, in the per-frame path.
- **The writable-handles cast is still load-bearing.** `state as CanvasRenderStateHandles` reassigns
  the read-only `canvas`/`context` at `canvasRenderTarget.ts:35`, `:82`, `:104` and
  `canvasCache.ts:163`. AGENTS.md names this pattern legacy and calls for runtime slots instead; the
  render-target redirection is the one place that genuinely needs to swap the handles.
- **Three manifest dependencies are not used by source.** `@flighthq/log` appears only in
  `enableCanvasTextureResolverGuards.test.ts`, `@flighthq/textureatlas` only in `canvasQuadBatch.test.ts`
  / `canvasTilemap.test.ts`, and `@flighthq/signals` in no file at all.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The 2026-06-24 headline — "`LineScaleMode
  'none'` implemented; `strokeScaleMode` added to `CanvasShapeDrawState`" — is **false**: `strokeScaleMode`
  has zero occurrences anywhere in `packages/`, and `defaultCanvasLineStyle` never reads `buf[i+4]`. Also
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
