---
package: '@flighthq/displayobject-canvas'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
---

# displayobject-canvas — Review

## Verdict

`solid — 88/100`. The Canvas 2D leaf renderer for the display-object subject family: a complete, well-factored set of per-kind draw functions over a shared draw-state spine, with explicit registration, an open material/shape-command registry pair, deterministic teardown, and a tidy blend-mode/scale-mode fidelity story. The incoming pass closed the last small contract gaps (naming, destroy verbs, an umbrella registration, a missing test block) and added a real `LineScaleMode 'none'` implementation. The remaining distance to authoritative is feature breadth (dashed strokes, per-axis scale modes, bitmap-fill repeat, render-target readback) plus the absence of cross-backend functional conformance scenes — all of it either cross-package or visual-session work, not within-file debt.

## Status-doc verification (as-claimed → verified)

Every claim in the `builder-67dc46d64` status entry checks out against `changes.patch`:

- **`registerCanvasDisplayObjectRenderers` + `canvasDisplayObjectRendererEntries`** — present in the new `canvasRegistration.ts`, exported from `index.ts`, 11 ordered `[Kind, Renderer]` pairs (Bitmap, DisplayObject, ParticleEmitter, QuadBatch, RichText, Scale9Shape, Shape, Sprite, TextLabel, Tilemap, Video), colocated `canvasRegistration.test.ts` with a count-equality test. Verified.
- **Blend-mode fidelity** — `canvasMaterials.ts` now maps `Alpha → 'destination-in'`, `Erase → 'destination-out'`; `Invert`/`Shader`/`Subtract` stay `null` with per-line comments and a block comment splitting expressible vs. unsupported. Tests assert all three. Verified.
- **`enable*` naming unification** — `enableCanvasRenderCache → enableCanvasRenderCacheSupport`, `enableCanvasTextInput → enableCanvasTextInputSupport`, all call sites and tests updated, including a stale comment in `canvasRichText.ts`. Verified.
- **Mask contract documented** — `drawCanvasRichTextMask` carries the uniform-clip-path explanation; a `drawCanvasRichTextMask` describe block now exercises the no-op. Verified.
- **`destroyCanvasRenderTarget`** and **`destroyCanvasRenderCacheTarget`** — both collapse the offscreen canvas to 0×0; the cache variant also removes the map entry and is documented as distinct from `releaseCanvasRenderCache` (slot-release, no collapse). Both tested, including the no-target no-op. Verified.
- **`LineScaleMode 'none'`** — `strokeScaleMode: LineScaleMode` added to `CanvasShapeDrawState` in `@flighthq/types`; `defaultCanvasLineStyle` reads `buf[i+4]` and stores `'none'` vs `'normal'`; `flushCanvasShapePath` divides `strokeWidth` by the mean axis scale from `getTransform()` for `'none'`. `pixelHinting` (`buf[i+3]`) documented as a noted no-op. Two tests (identity, 2× scale). Verified.
- **Scratch `_drawState`** — `renderCanvasShapeCommands` now resets a module-level scratch via `resetCanvasShapeDrawState` instead of allocating per draw; the `flush` closure is re-bound per reset to capture the current context; non-recursion is documented as the safety precondition. Verified.

No claim was overstated. The status doc's self-estimate (91) is a touch high against the AAA bar (see Gaps); 88 reflects the still-open breadth and the missing visual conformance.

## Present capabilities

Grounded in `incoming/builder-67dc46d64/head/packages/displayobject-canvas/src/`:

- **Full per-kind renderer set** — `defaultCanvas*Renderer` for Bitmap, DisplayObject, ParticleEmitter, QuadBatch, RichText, Scale9Shape, Shape, Sprite, TextLabel, Tilemap, Video, each a `{ createData, submit }` object. `canvasBitmap.ts` honors `sourceRectangle`, per-bitmap `smoothing` against `state.allowSmoothing`, blend mode, and alpha.
- **Shape command spine** — `canvasShapeCommands.ts` implements the retained-mode graphics vocabulary as registerable `CanvasShapeCommand` objects (`beginFill`, `beginBitmapFill`, `beginGradientFill`, `lineStyle`, `moveTo`/`lineTo`/`curveTo`, fills/winding), dispatched by `renderCanvasShapeCommands` over a shared `CanvasShapeDrawState`; `canvasShapeRegistry.ts` makes the command set open and user-extensible.
- **Material seam** — `canvasMaterialRegistry.ts` exposes `registerCanvasMaterialRenderer`/`resolveCanvasMaterialRenderer`/`getCanvasMaterialRenderer` over a lazy `materialRendererMap`, with `applyCanvasMaterial` bracketing a save/restore only when a material contributes draw state — the common path pays nothing.
- **Blend modes** — `canvasMaterials.ts` maps the full `BlendMode` enum to `globalCompositeOperation`, caches the current mode on the runtime to skip redundant context writes, and documents every unsupported mode.
- **Clipping/masking** — handled uniformly through `canvasClip.ts` / `canvasClipRectangle.ts` (`pushCanvasClipContours`), not per-kind `drawMask`; the canvas backend correctly treats `drawMask` as a no-op satisfying the renderer interface.
- **Offscreen targets & caching** — `canvasRenderTarget.ts` (`create`/`begin`/`end`/`resize`/`destroy`) and `canvasCache.ts` (`createCanvasCacheState`, `ensure`/`get`/`refresh`/`release`/`destroy` cache targets, `enableCanvasRenderCacheSupport`).
- **Text** — `canvasRichText.ts` / `canvasTextLabel.ts` / `canvasTextMeasure.ts` render the text spine; `canvasTextInput.ts` installs an opt-in caret/selection overlay (`enableCanvasTextInputSupport`) so a static `RichText` pulls no text-input code.
- **CSS-filter binding** — `canvasCSSFilterBinding.ts` bridges the filters descriptors to `context.filter`.
- **Tree-shakable, side-effect-free** — single `.` export, `sideEffects: false`, no top-level registration; every wire-up is an explicit `register*`/`enable*` call.

Test coverage is dense (status reports 217 across 29 files; the diff adds material/registration/scale-mode/ destroy/rich-text-renderer cases), one colocated file per source file.

## Gaps

Measured against the AAA 2D display-object feature target (charter is a stub — see Candidate open directions):

- **Dashed strokes** — no `setLineDash`/`lineDashOffset`; blocked on a `dashPattern`/`dashOffset` field in the `lineStyle` command tuple in `@flighthq/types`+`@flighthq/shape`. Cross-package.
- **`LineScaleMode 'horizontal'` / `'vertical'`** — fall back to `'normal'`; needs per-axis scale decomposition of the canvas transform. Within-package but a focused item.
- **`BitmapFillRepeat` / `pixelSnapping`** — `beginBitmapFill` takes a boolean `repeat`, not the four-way `repeat`/`no-repeat`/`repeat-x`/`repeat-y`; no pixel-snapping. Needs new types upstream.
- **Render-target readback** — no `getCanvasRenderTargetImageData` / `readCanvasRenderTargetPixels`; the ownership line with `@flighthq/surface` is undecided (raw `ImageData` vs a `CanvasRenderTarget → ImageSource` bridge).
- **Image-smoothing parity** — smoothing overrides are honored in `drawCanvasBitmap` but not audited across scale-9, tilemap, and pattern fills for consistency.
- **Cross-backend functional conformance scenes** — none exist for Erase/Alpha blend, scale-mode 'none', or scale-9 smoothing. jsdom unit tests cannot prove the rendered pixels; this is the single largest gap to authoritative and the TS half of the future `rust:skia ~ ts:canvas` pairing.

## Charter contradictions

None — the charter is an unfilled stub (all four body sections are `TODO`), so there is nothing to contradict. Every judgement above falls back to the codebase-map AAA standard, as the rubric rule prescribes. The absence of a charter is itself the headline finding for the direction pass.

## Contract & docs fit

**Lives up to the contract:**

- **`@flighthq/types`-first types** — `strokeScaleMode` was added to `CanvasShapeDrawState` _in `@flighthq/types`_, not as a module-local field; the rationale (custom commands registered via `registerCanvasShapeCommand` must be able to read/write it) is sound and matches the header-layer rule. Good catch by the worker.
- **Full unabbreviated names / global uniqueness** — every export carries `Canvas` + the operated-on type word; no abbreviations.
- **Teardown verbs** — `destroyCanvasRenderTarget` / `destroyCanvasRenderCacheTarget` correctly use `destroy*` (they free a non-GC compositor/GPU backing store now), kept distinct from `releaseCanvasRenderCache` (`release*` = cache slot bracket). Verb discipline is exactly right.
- **`enable*Support` naming** — the rename aligns with the SDK-wide `enable*Support` opt-in pattern.
- **Sentinels not throws** — `resolveCanvasMaterialRenderer`/`getCanvasMaterialRenderer` return `null`; `destroy*` is a no-op on a missing target; nothing throws on expected-absent input.
- **Single root export, `sideEffects: false`, no top-level registration** — all satisfied.
- **No Rust crate** — correct and intentional: `crate: null`; the rust map lists `displayobject-canvas` as host-web-only (Canvas2D substrate does not exist in the Rust box; software parity is `displayobject-skia`).

**Structural-fork fit (no drift):**

- The blend-mode map (`CANVAS_BLEND_MODE: Record<BlendMode, …>`) is a **closed record**, but this is the _correct_ exception under fork B, not a registry violation: `BlendMode` is a genuinely closed, finite enum, the lookup sits on a per-draw hot path, and the table is fully auditable. By contrast the genuinely-open axes (materials, shape commands) _are_ open registries (`canvasMaterialRegistry`, `canvasShapeRegistry`). The package draws the open/closed line in the right place.

**Candidate doc revisions (user's gate, not mine):**

- The **live** `agents/index.md` Package Map still lists only `@flighthq/render-canvas`/`render-dom`/`render-webgl` and has no entry for `displayobject-canvas` (or its `displayobject-<backend>` siblings) and no `@flighthq/clip` line. The **bundle's** evolved `index.md` already reflects the `<subject>-<backend>` reorg and adds `@flighthq/clip`. The live map is stale against the shipped shape; the Package Map needs a `displayobject-canvas` entry describing it as the Canvas 2D leaf renderer of the display-object family.
- The `CONTRACT.md` `crate: null` enumeration already lists `displayobject-canvas` — consistent, no change needed there.

## Candidate open directions

The charter is silent on all of these; each is a question the direction pass should settle rather than an agent assume:

1. **Scope of the Canvas backend vs. `displayobject-skia`.** Is `displayobject-canvas` the _primary_ 2D software path (richest fidelity, owns the 2D feature target), or the _thin host-web_ path with `skia` as the conformance reference? This decides how hard to push canvas-specific fidelity (dashed strokes, per-axis scale modes) vs. deferring to the shared rasterizer.
2. **Render-target readback ownership.** Does canvas expose raw `ImageData`, or only a `CanvasRenderTarget → ImageSource` bridge into `@flighthq/surface`? This is a real API fork that blocks the readback feature and should not be decided silently.
3. **Fidelity floor for unsupported blend modes.** Is "degrade to normal, document it" the accepted posture for `Invert`/`Shader`/`Subtract`, or should canvas gain a pixel-readback path for at least `Invert`? Today it is documented degradation; the charter should bless or reject that.
4. **Where cross-backend conformance scenes live and which backends they target.** The blend/scale-mode features are unverified visually; the charter should name the expectation (canvas ↔ dom ↔ gl parity scenes, plus the `rust:skia ~ ts:canvas` cross-impl pairing).
5. **The line between "Canvas command" extensibility and `@flighthq/shape`.** The open `canvasShapeRegistry` lets users add stroke/fill commands; several deferred features (dash, repeat, pixel-snapping) are blocked on upstream tuple changes. Is the command tuple the right extension surface, or should bitmap-fill/dash be first-class typed fields? A boundary question worth a ruling.
