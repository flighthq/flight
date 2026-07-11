---
package: '@flighthq/displayobject-wgpu'
status: solid
score: 90
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch (builder-67dc46d64)
---

# displayobject-wgpu — Review

## Verdict

`solid — 90/100`. A broad, well-shaped WebGPU per-subject leaf-renderer set covering every 2D display-object kind (bitmap, shape, scale9, sprite/quad-batch, tilemap, particles, text label, rich text, video, render-cache, clip, color-transform materials, velocity writers). This pass (builder-67dc46d64) is a maturity/hygiene increment — register-all convenience, a per-frame stats API, typed renderer-data helpers, and closing four exports:check gaps — not new rendering capability. Every status claim verifies against the diff. The remaining ceiling is real-feature gaps (advanced blend, GPU stroke/gradient fills, glyph-atlas text, MSAA), all of which the status correctly attributes to cross-package blockers.

## Status-doc verification (AS-CLAIMED → verified)

Every claim in the distributed worker report holds against `changes.patch`:

- **`registerWgpuDisplayObjectRenderers` / `registerWgpuSpriteRenderers`** exist in `wgpuRegistration.ts` (+69) with colocated tests (`wgpuRegistration.test.ts` +115). Both call `registerDefaultWgpuMaterial` first, then `registerRenderer` per kind. The display-object set registers 11 kinds + render-cache; the sprite set registers the 4 sprite-graph kinds. JSDoc correctly notes tree-shaking is unchanged.
- **`createWgpuRendererData<T>` / `getWgpuRendererData<T>`** exist in `wgpuRendererData.ts` (+31) with tests. The migration is real: `grep "as unknown as"` over the 5 cited renderer files (`wgpuShape`, `wgpuTextLabel`, `wgpuVideo`, `wgpuRichText`, `wgpuScale9Shape`) shows **zero** remaining `RendererData`/`FooData` double-casts — they now route through the helpers. (The `as unknown as` hits that remain are all in `wgpuVelocity.ts`, casting nodes to graph-feature traits — a different concern, untouched and out of scope here.)
- **`WgpuRenderStats`** is added to `@flighthq/types` (`packages/types/src/WgpuRenderStats.ts`, +11), not inline — contract-correct type homing. `wgpuRenderStats.ts` (+61) exposes the four functions with the claimed WeakMap-backed, no-op-before-init semantics.
- **`recordWgpuBatchFlush` wiring is live**: `wgpuSpriteBatch.ts` line 200 calls it immediately after `pass.draw(6, count, 0, 0)` — exactly as claimed, and a no-op when stats are uninitialized.
- **Four previously-uncovered exports** (`ensureWgpuQuadBatchResources`, `getWgpuQuadBatchPipeline`, `getWgpuQuadBatchPreludeWGSL`, `packWgpuSpriteBatchMaterialInstance`) gained `describe` coverage in `wgpuSpriteBatch.test.ts` (+85) and `wgpuQuadBatch.test.ts` (+46).

The status's two honest deferrals also verify: `recordWgpuTextureUpload` is defined/exported/tested but **has no caller** (wiring it needs `render-wgpu`'s `bindWgpuTexture`/`updateWgpuTextureEntry`), and the `displayobject-gl` register-all twins are still absent.

## Present capabilities

Grounded in `incoming/builder-67dc46d64/head/packages/displayobject-wgpu/src/`:

- **Full 2D kind coverage.** `defaultWgpu*Renderer` for bitmap, display-object container, particle emitter, quad-batch, rich text, scale9 shape, shape, sprite, text label, tilemap, video, render-cache.
- **Sprite batching** (`wgpuSpriteBatch.ts`, the largest module): instanced quad batch with `SPRITE_INSTANCE_FLOATS = 13`, pipeline caching keyed by `blendMode-stencilMode-format`, a buffer pool (`resetWgpuSpriteBatchBufferPool`), material-instance packing, and a WGSL prelude (`getWgpuQuadBatchPreludeWGSL` — `struct InstanceData` + `fn quadBaseVertex`).
- **Shape rendering via tessellated mesh** (`wgpuShapeMesh.ts`, `WgpuShapeMesh`, `drawWgpuShapeMeshes`) plus scale9 remapping (`remapWgpuScale9Commands`, `buildWgpuScale9Mapper`). Shape-command builders are re-exported from `@flighthq/displayobject-canvas` under `defaultWgpu*` aliases (a deliberate shared-spine reuse — the command IR is backend-agnostic).
- **Clipping** as a real subsystem: `enableWgpuClipSupport`, rectangle scissor (`pushWgpuClipRectangle`/`popWgpuClipRectangle`) and stencil-contour clipping (`pushWgpuClipContours`/`popWgpuClipContours`) — matching the codebase-map note that clip _rendering_ lives in the `displayobject-<backend>` clip modules.
- **Render cache** (`wgpuCache.ts`): off-screen target lifecycle with `enableWgpuRenderCache`, `ensureWgpuRenderCacheTarget`, `refreshWgpuRenderCache`, `releaseWgpuRenderCache` (correct acquire/release verb bracket).
- **Color-transform materials** (`wgpuColorTransformMaterial.ts`, `wgpuMaterials.ts`): per-instance and uniform color-transform material renderers over the `WgpuMaterialRenderer` seam.
- **Velocity-field writers** (`wgpuVelocity.ts`): a **per-state registry** (`registerWgpuVelocityWriter`/`getWgpuVelocityWriter` over a `WeakMap<state, Map<Kind, Writer>>`) with default writers for display-object, particle-emitter, and quad-batch kinds — the registry-by-default shape (fork B) already in place, not a closed switch.
- **Text** (`wgpuTextLabel.ts`, `wgpuRichText.ts`, `wgpuTextInput.ts`): label + rich-text rendering with a registerable text-input overlay seam (`registerWgpuTextInputOverlay`, `enableWgpuTextInput`).
- **New this pass:** register-all convenience, the stats API, and the typed renderer-data helpers above.

Side-effect-free (`"sideEffects": false`), single root `.` export, no top-level `registerRenderer` — all registration is behind `register*` functions. Contract-clean on packaging shape.

## Gaps

What a mature GPU 2D backend has that this lacks — each is externally gated, per the status, and none blocks use of the package:

- **Blend modes beyond Normal + Add.** `wgpuSpriteBatch.ts` defines only `NORMAL_BLEND` and `ADD_BLEND`; any other `BlendMode` silently resolves to Normal (`blendMode === BlendMode.Add ? ADD_BLEND : NORMAL_BLEND`). The full blend set (Multiply, Screen, Overlay, etc.) is unimplemented. Gated on a blend-mode taxonomy in `render`/`@flighthq/types`. (Note: this makes the `render-backend-support.md` "wgpu = none" line stale — see Contract & docs fit.)
- **GPU stroke tessellation** and **GPU gradient / bitmap-fill shading** for shapes — blocked on a shared tessellator/fill design in `@flighthq/path`. Shapes today are solid-fill mesh.
- **Glyph-atlas GPU text.** Text rendering does not yet have a GPU glyph atlas; blocked on the `text-shaping` seam landing (the codebase-map "designed, not yet built" package).
- **MSAA / multisample pipelines** — blocked on `render-wgpu` growing multisample support first.
- **Texture-upload stats unwired** — `recordWgpuTextureUpload` counts nothing until `render-wgpu`'s upload path calls it. A measurable hole in the stats API's completeness, though zero-cost.
- **No stats _integration_ test** — the four stats functions are unit-tested in isolation, but no test drives `resetWgpuRenderStats` → `flushWgpuSpriteBatch(count>0)` → assert counts. The wiring is verified by reading source, not by a test.
- **No Rust-crate parity yet** (`flighthq-displayobject-wgpu`) — future track.

## Charter contradictions

None. The charter (`charter.md`) is a stub — only "What it is" is filled (seeded from the prior depth review); North star, Boundaries, Decisions, and Open directions are all `TODO`. With nothing blessed to contradict, this section is empty by construction. Judged against the codebase-map AAA fallback, the work is consistent with every stated design constraint (see below). The thin charter is itself the headline finding — see Candidate open directions.

## Contract & docs fit

**(a) How well the package lives up to the contract** — strongly:

- **Types-first homing:** `WgpuRenderStats` was added to `@flighthq/types`, not inline. Correct.
- **Full, unabbreviated names:** every export carries the `Wgpu` + subject word (`registerWgpuDisplayObjectRenderers`, `recordWgpuBatchFlush`, `getWgpuRenderStats`). No abbreviations.
- **Sentinels over throws:** `getWgpuVelocityWriter` / `getWgpuRenderCacheTarget` return `null`; `record*` functions no-op when uninitialized. No throwing for expected-absence cases.
- **Allocation verbs:** `create*` allocates, `release*`/`reset*` reclaim, `ensure*` is idempotent-get — all used correctly. `releaseWgpuRenderCache` pairs with the cache acquire.
- **Registry over closed union:** the velocity-writer subsystem and the renderer registry are both open `Map`-keyed registries (fork B satisfied). The one closed branch — `blendMode === Add ? … : Normal` — is a _missing feature_, not a closed-union design choice that should be a registry; blend dispatch is correctly a hot-loop concern and the small set is fine until the taxonomy grows.
- **Single root export, `sideEffects: false`, no top-level registration:** all satisfied.
- **Type-hygiene helpers:** `createWgpuRendererData`/`getWgpuRendererData` are honest about being cast-only (`as unknown as`) — they narrow the _call-site_ noise without claiming type safety they don't have. Reasonable, and the JSDoc says so.

**(b) Where the contract / admin docs are stale against the work:**

- **`render-backend-support.md` is stale on wgpu blend.** It states "blend modes … wgpu = none." The sprite batch path implements **Normal + Add** (`NORMAL_BLEND`/`ADD_BLEND`, pipeline-keyed by blend mode). The doc should read "wgpu = Normal + Add" to match `displayobject-gl`'s line. **Candidate revision.**
- **Package Map has no `displayobject-wgpu` (or `displayobject-gl`) line.** The head `index.md` Package Map lists `render-canvas`/`render-dom`/`render-webgl` and `filters-gl`, but the `displayobject-<backend>` leaf-renderer family (the 2026-06-22 render reorg the _rust_ map already describes) is absent from the TS map. A reader of the TS Package Map cannot find where wgpu display rendering lives. **Candidate revision:** add the `displayobject-gl` / `displayobject-wgpu` / `displayobject-canvas` / `displayobject-dom` family to the TS Package Map.

## Candidate open directions

The charter is a stub; these are the questions a future direction pass must settle (each became an assumption I had to make to review):

1. **What is the blend-mode boundary for this package?** Is wgpu intentionally Normal+Add-only until the `render`/`types` blend taxonomy lands, or is the full blend set in-scope here once unblocked? This is the single biggest visible feature gap.
2. **Is the stats API (`WgpuRenderStats`) a blessed long-term surface or a temporary diagnostic?** Its home is `@flighthq/types` (a cross-package commitment), yet `textureUploadCount` is wired to nothing. Should a parallel `GlRenderStats` exist, or should stats be a backend-agnostic `RenderStats` in `render`? A direction call avoids per-backend drift.
3. **Should `register*DisplayObjectRenderers` / `register*SpriteRenderers` be a cross-backend contract?** The status flags the missing `displayobject-gl` twins. If "register all built-ins for backend X" is a blessed pattern, it should be symmetric across gl/wgpu/canvas/dom — a charter-level decision, not a per-package add.
4. **Where do GPU shape fills (stroke tessellation, gradients, bitmap fills) live** — in `@flighthq/path` as a shared tessellator consumed by both GPU backends, or per-backend? This is the gate on shape fidelity and is explicitly cross-package (fork A/E territory).
5. **Rust-crate parity expectations.** `flighthq-displayobject-wgpu` is named in the conformance map; the charter should state whether TS-Gold-then-Rust or co-evolution is the intended order.
