# New Package Spec: @flighthq/displayobject-skia

**Represents:** The Rust in-box software display-object renderer (tiny-skia) over `render` — rasterizes shape/path/text/bitmap/sprite leaves into a `flighthq-surface` RGBA buffer; bit-deterministic across machines, serving as the conformance _reference_ the GPU backends are checked against and the universal no-GPU fallback.

**Requested by:** rendering-gpu

## Fits

The rendering-gpu breadth review (Coverage 84/100) lists this as an outright missing package: "`displayobject-skia` (Rust) software backend — referenced repeatedly in the Rust docs as the in-box software-render/reference path, but no `displayobject-skia` package/crate is present yet. Without it the Rust port has GPU backends only and no deterministic software reference." The Rust [conformance map](../../../rust/conformance.md) already specifies its role, layering, and rationale in detail — this spec turns that prose into a concrete, tiered build plan.

This is the unusual case of a **Rust-first / Rust-only** package: there is no `@flighthq/displayobject-skia` TS counterpart, and there should not be one. Its TS-side peer in capability is `displayobject-canvas` (the immediate-mode software path), but Canvas2D's substrate is a browser API absent from the box, so the [crate existence rule](../../../rust/conformance.md#the-crate-existence-rule) deliberately _excludes_ `displayobject-canvas` from Rust and routes the software-render capability through `displayobject-skia` instead. tiny-skia shares Skia's raster heritage with Chrome's Canvas2D, so `rust:skia ~ ts:canvas` has the best structural-conformance shot. Naming, layering, allocation discipline, and the per-subject draw seam all still follow the TS house style — the spec below names TS-shaped symbols (`createSkiaRenderState`, `drawSkiaShape`, `registerSkiaShapeRenderer`) so the Rust `flighthq-displayobject-skia` crate snake_cases them 1:1 and a reader can map it onto the other backends without translation.

- **Crate name & shape:** `flighthq-displayobject-skia` (Rust-only; recorded in the [Rust-only set](../../../rust/conformance.md#rust-only-no-ts-counterpart)). One backend leaf renderer over the `render` core, peer to `displayobject-gl` / `displayobject-wgpu`. No top-level side effects; registration is opt-in via `register*` functions.
- **Where it sits:** a **per-subject leaf renderer** in the three-layer render architecture — `render` (backend-agnostic core: registration, render state/queue, render-node data, update pipeline, draw contracts) → _(no GPU core; skia is its own software core)_ → `displayobject-skia`. Unlike the GPU backends it does **not** sit over `render-gl` / `render-wgpu`; its "core" is tiny-skia's `Pixmap` raster surface plus a small skia-local render-state, since the software substrate has no shader/target plumbing to share.
- **Dependencies:** `flighthq-types` (the header — render-node, blend-mode, kind, surface, and the skia render-state contract), `flighthq-render` (registration + update pipeline + draw contracts), `flighthq-surface` (the `Surface` RGBA buffer it rasterizes into; tiny-skia's `Pixmap` layout matches `flighthq-surface` 1:1, so no copy/readback), `flighthq-displayobject` (the leaf entity types it draws), and `flighthq-geometry` (matrix/rectangle/path math). For text it consumes the `textshaper` seam (rustybuzz tier) and rasterizes glyph outlines through the same tiny-skia path filler. Underlying crate: `tiny-skia` (already builds in the workspace per the conformance map). It must **not** depend on any GPU core or on `displayobject-gl`/`displayobject-wgpu`.
- **Backend seam:** this _is_ a render backend, not a platform-capability seam, so it follows the `register*Renderer` / `createSkiaRenderState` pattern of the other display-object backends — not the `get*Backend`/`set*Backend`/`createWeb*Backend` platform pattern. The swappable axis here is the renderer registry in `render` (`registerRenderer(state, FooKind, renderer)`), last-write-wins.
- **Neighbor packages:** `displayobject-gl`, `displayobject-wgpu` (the GPU leaf siblings it is checked against); `filters-surface` / `effects` / `filters` (the existing CPU filter/effect path it reuses — no `filters-skia` / `effects-skia`); `capture` (consumes its `Pixmap`/`Surface` output for headless PNG/fingerprint); the optional future `displayobject-cairo` sibling if literal Cairo output is ever wanted.

## Bronze

The minimum that makes the Rust port have a deterministic software reference at all: a skia render-state, the registration entry, and software draws for the core 2D leaves (bitmap, shape, sprite/tilemap) into a `flighthq-surface` buffer, with the existing blend-mode and mask vocabulary honored. No text shaping yet (Bronze can draw a placeholder box or skip text), no caching.

**Types (`flighthq-types` first):**

- `SkiaRenderState` — the skia-local render-state contract (analogue of `GlRenderState` / `CanvasRenderState`): owns the target `Pixmap`/`Surface`, the current transform stack, current blend mode, current clip, and the renderer registry handle. `Readonly` where not mutated mid-frame.
- `SkiaRendererData` — per-node renderer data slot (paths/glyph runs cached per leaf); `null` when a leaf needs none, mirroring the `Renderer.createData` contract.
- Reuse existing header types unchanged: `BlendMode`, `RenderNode`/`Renderable`, `DisplayObjectKind` and friends, `Surface`, `Matrix`/`Rectangle`.

**`flighthq-displayobject-skia` (Rust; TS-shaped names shown):**

- `createSkiaRenderState(target: Surface): SkiaRenderState` — allocate a skia render-state pointing at a caller-owned `flighthq-surface` buffer (the `Pixmap` aliases the same RGBA memory; no copy).
- `destroySkiaRenderState(state)` — free the skia-owned scratch (path builders, glyph caches). `destroy*`, since tiny-skia objects are non-GC native resources.
- `registerSkiaDisplayObjectRenderer(state)` — the single opt-in entry that registers the bitmap/shape/sprite/tilemap leaf renderers against their `*Kind`s in the `render` registry (mirrors how a host wires `displayobject-gl`). Not called at module top level.
- `drawSkiaBitmap(state, renderNode)` — blit a bitmap leaf's `ImageSource` into the target with the node's transform/alpha/blend.
- `drawSkiaShape(state, renderNode)` — rasterize the shape's path commands (fill + stroke) via tiny-skia's path filler.
- `drawSkiaSprite(state, renderNode)` / `drawSkiaTilemap(state, renderNode)` — atlas-region blits for the sprite/quad-batch and tilemap leaves.
- `drawSkiaDisplayObject(state, source)` — the container walk entry that runs the leaves; pairs with `prepareDisplayObjectRender(state, source)` from `render` (the required pre-draw update pass).
- `applySkiaBlendMode(state, mode)` + `enableSkiaBlendModeSupport(state)` — the blend-mode seam mirroring `apply*BlendMode` / `enable*BlendModeSupport` on the other backends; maps `BlendMode` to tiny-skia's `BlendMode` where supported, sentinel no-op (source-over) where not.
- `clearSkiaRenderTarget(state, color)` — clear the target buffer to a packed `0xRRGGBBAA` color.
- `getSkiaRenderSurface(state): Surface` — hand back the rasterized buffer for `capture` / fingerprinting (the conformance read path).

**Effort:** medium. Path fill/stroke, image blit, and matrix transform are tiny-skia's core competency; the work is the render-node → tiny-skia translation and matching the existing blend/alpha semantics bit-for-bit against the GPU backends' intent.

## Silver

Competitive with a real software rasterizer backend (the "Cairo 2.0" the conformance map describes): text via the rustybuzz shaper + tiny-skia glyph fill, masking/clipping, the render-cache path so cached subtrees rasterize once, and the first committed conformance scenes pinning skia as the reference.

**Types (`flighthq-types`):**

- `SkiaGlyphRun` / `SkiaTextData` — shaped-glyph run cache (glyph ids, advances, offsets from the `textshaper` seam) attached to text leaves' `SkiaRendererData`.
- `SkiaClip` — the active clip region (rect stack + path clip), so masking is a first-class part of the render-state contract rather than ad-hoc.
- `SkiaRenderCacheEntry` — the cached-`Pixmap` slot for the render-cache path (the skia analogue of `glRenderCache` / `canvasRenderCache`).

**`flighthq-displayobject-skia`:**

- `drawSkiaTextLabel(state, renderNode)` / `drawSkiaRichText(state, renderNode)` — rasterize laid-out text: pull the `textlayout` result, shape runs through the registered `textshaper` (rustybuzz) backend, fill glyph outlines via ttf-parser → tiny-skia path. Returns/draws nothing meaningful (sentinel) when no full-glyph shaper is registered, matching the text-stack posture.
- `drawSkiaDisplayObjectMask(state, renderNode)` / `applySkiaClip(state, clip)` / `pushSkiaClipRect` / `popSkiaClip` — the masking/clipping seam (mirrors `drawMask` in the `Renderer` contract and the per-backend mask draws). Both shape-mask clipping and rectangular scissor-style clip.
- `registerSkiaTextRenderer(state)` / `registerSkiaMaskRenderer(state)` — opt-in registration for the text and mask leaves, so a host that doesn't draw text doesn't pull the shaper-dependent code (tree-shaking discipline).
- `skiaRenderCache` / `refreshSkiaRenderCache(state, source, options)` — the render-cache renderer registration + refresh, so a cached subtree rasterizes to its own `Pixmap` once and composites thereafter (matches `imageRenderCache` family). Image render caching lives in the backend, per the codebase map.
- `drawSkiaRenderTargetResult(state, target)` — composite an offscreen skia `Pixmap` target back into the scene, for cache and for the filter/effect bracket.
- `acquireSkiaPixmap(state, width, height)` / `releaseSkiaPixmap(state, pixmap)` — pooled offscreen `Pixmap`s for cache/filter scratch (paired `acquire*`/`release*` brackets), so per-frame filter passes don't reallocate.
- `applySkiaColorTransform(state, renderNode)` — honor the node's `ColorTransform` (multiply/offset) during blit, matching the materials path on the GPU backends.

**Cross-backend / conformance:**

- Committed `flighthq-functional` scenes naming skia as the reference cell: `shape_fill_skia`, `bitmap_blit_skia`, `text_label_skia`, paired by name with the TS `tests/functional/*` scenes, fingerprint-compared headlessly through `capture`. Because skia output is bit-deterministic, these baselines are machine-independent — the regression baselines the GPU backends are _diffed against_, not just stored fingerprints.
- Filter/effect integration: route a filtered leaf through `filters-surface` / `effects` (CPU) over the skia `Pixmap`, proving the existing CPU filter path composes with the software renderer with no new `filters-skia`.

**Effort:** large. Text (shaper seam wiring + glyph outline fill) and the masking/clip + cache machinery are the heavy items; the conformance-scene baselining is bounded but is where the reference-backend value is realized.

## Gold

The authoritative software-render reference: every display-object leaf the GPU backends draw is drawable in skia, exhaustive blend/clip/color-transform fidelity, full CPU filter/effect parity, performance (tiling, dirty-region, multithreaded raster), complete tests/docs, and a verified bit-deterministic conformance baseline the whole port leans on.

**Types (`flighthq-types`):**

- `SkiaDirtyRegion` / `SkiaTileGrid` — dirty-rectangle and tile descriptors for partial re-raster and (optional) multithreaded tiled rendering.
- `SkiaStrokeStyle` (caps/joins/miter/dash) and `SkiaFillRule` (nonzero/evenodd) — full path-style fidelity surfaced as header types so shape conformance is exact.
- `SkiaSurfaceFormat` — pin the RGBA8 non-sRGB premultiplied layout explicitly so the `Pixmap` ↔ `Surface` ↔ capture chain is type-checked (the single-color-convention rule made structural).
- `enableSkiaRenderSignals` group payloads (`onSkiaFrameRasterized`, `onSkiaTileComplete`) — opt-in raster instrumentation, only if a real consumer needs it.

**`flighthq-displayobject-skia`:**

- **Complete leaf coverage:** `drawSkiaParticleEmitter`, `drawSkiaQuadBatch`, `drawSkiaVideo` (frame blit), `drawSkiaScale9` / `buildSkiaScale9Mapper` (nine-slice), `drawSkiaTextInputOverlay` — every leaf `displayobject-gl` draws has a skia twin, so "does this exist in skia?" is always yes (the existence-rule cognitive-load argument applied within the crate).
- **Exhaustive blend modes:** map the full `BlendMode` vocabulary, implementing any tiny-skia gaps as explicit per-pixel software composites (no silent source-over fallback at Gold) so cross-backend blend parity is complete.
- **Stroke / fill fidelity:** caps, joins, miter limits, dashing, even-odd vs nonzero fill, anti-alias control — full SVG-grade path styling matching whatever the shape model expresses.
- **Performance:** `drawSkiaDisplayObjectRegion(state, source, dirtyRegion)` for dirty-rectangle re-raster; optional tiled multithreaded raster (`drawSkiaTileGrid`) using tiny-skia's thread-safe `Pixmap` slices; glyph-bitmap cache to avoid re-filling repeated glyphs.
- **Full filter/effect bracket:** `captureSkiaFilterSource` / `applySkiaFilteredResult` brackets that hand a leaf's rasterized `Pixmap` to `filters-surface` / `effects` and composite the result, covering blur/glow/bevel/drop-shadow/color-matrix/convolution/displacement at the same coverage as the GPU backends' filter passes.
- `enableSkiaRenderSignals(...)` / `disableSkiaRenderSignals(...)` — signal group owned here (signals live in the package that owns the entity), if instrumentation is warranted.
- **Determinism guarantees:** a documented and tested invariant that identical scene + identical inputs → byte-identical `Surface` across OS/arch (the property that makes skia the reference); a `getSkiaRenderFingerprint(state)` convenience over `createSurfaceFingerprint`.

**Conformance / Rust:**

- The conformance _reference_ role made real: the parity matrix's `gl` / `wgpu` cells are diffed **against** the `skia` cell (not only against stored TS baselines), so a GPU regression surfaces as "diverged from the deterministic software reference." Recorded in the [parity](../../../rust/parity.md) matrix and the [conformance map](../../../rust/conformance.md).
- Exhaustive colocated tests: one `*.test`-equivalent per source module, assertion-level draws (raster a known scene, assert exact pixels), alias-safe state operations, sentinel coverage (no-shaper text, unsupported format), and the machine-independent baseline corpus.
- The optional `flighthq-displayobject-cairo` sibling decision documented (build only if literal Cairo output is ever required; skia is the default software path).

**Effort:** very large; the long tail is exhaustive blend/stroke fidelity, the tiled/multithreaded performance path, and standing up skia as the _diff target_ for the GPU backends (a process/tooling change in parity, not just code). Order Gold after Silver proves skia matches `ts:canvas` on the core leaves.

## Boundaries

- **No GPU plumbing.** `displayobject-skia` is software-only; it never depends on `render-gl` / `render-wgpu`, owns no `WebGLTexture`/`GPUTexture`, and shares no shader/target code. Its "core" is tiny-skia's `Pixmap`. GPU leaf rendering stays in `displayobject-gl` / `displayobject-wgpu`.
- **No Canvas2D / DOM emulation.** This is the in-box _replacement_ for the software-render capability, not an emulator of the Canvas2D context or the DOM tree. `displayobject-canvas` / `displayobject-dom` remain [excluded](../../../rust/conformance.md#excluded--no-substrate-in-the-box) (browser substrate absent from the box); skia does not try to reproduce Canvas2D's exact pixels, it provides the software-render _capability_ deterministically. A browser-Canvas2D path, if ever wanted, is a `host-web` JS concern.
- **CPU filters/effects stay in their existing crates.** No `filters-skia` / `effects-skia`. Blur/glow/bevel/etc. reuse `filters-surface` / `effects` / `filters` over the skia `Pixmap` (which _is_ a `flighthq-surface` buffer). Only shape/path/text/bitmap rasterization goes through tiny-skia.
- **Text shaping stays in the shaper seam.** Glyph _shaping_ (ids/advances/clusters, GSUB/GPOS) is the `textshaper` (rustybuzz) backend's job; _layout_ is `textlayout`'s. `displayobject-skia` only _rasterizes_ the shaped+laid-out glyphs (outline → path fill). It does not shape or lay out text itself.
- **Surface ownership / pixel ops stay in `surface`.** The target buffer, fingerprint/compare, and CPU pixel operations belong to `flighthq-surface`; skia rasterizes _into_ a caller-owned `Surface` and reads it back via `getSkiaRenderSurface` — it does not redefine `Surface` or duplicate pixel ops.
- **Headless capture / PNG / fingerprint stays in `capture`.** `displayobject-skia` produces the `Pixmap`/`Surface`; `flighthq-capture` turns it into PNG / fingerprint and drives the conformance gate. The renderer owns no file I/O.
- **No host / event loop / windowing.** It is a pure renderer; the event loop, window, and surface acquisition belong to the `host-*` crates. A host points skia at an offscreen `Surface` (or, on web, one `putImageData`/frame).

## Open design questions

- **Skia render-state vs a shared software core.** Should `SkiaRenderState` live entirely in this crate, or should a thin `render-software` core be factored out (parallel to `render-gl`/`render-wgpu`) in case `displayobject-cairo` ever lands and wants to share transform/clip/blend bookkeeping? Leaning crate-local until a second software backend actually exists (avoid premature abstraction), but the layering precedent argues for the seam.
- **`Pixmap` ↔ `Surface` aliasing contract.** tiny-skia's `Pixmap` and `flighthq-surface`'s buffer are both RGBA8 premultiplied — can skia rasterize _directly into_ the caller's `Surface` memory (zero-copy alias), or does ownership/lifetime force a `Pixmap` it copies out of? The zero-copy path is the whole performance argument; pin the borrow/ownership rule (likely `&mut Surface` → `PixmapMut`) early.
- **Premultiplied-alpha exactness.** The color convention is RGBA8 non-sRGB _premultiplied_; tiny-skia is premultiplied internally too, but rounding in premultiply/unpremultiply must match the GPU backends' shader math bit-for-bit for skia to be a valid diff target. Needs a documented rounding rule and a conformance test, not just "both are premultiplied."
- **Blend-mode gaps.** tiny-skia implements the Porter-Duff + separable PDF blend modes but may not cover every Flight `BlendMode` (e.g. some Flash-specific modes). Silver can sentinel-fallback unsupported modes to source-over; Gold must implement them as explicit software composites. Decide the Bronze/Silver fallback policy and the Gold completeness bar.
- **Reference vs replica.** The map says `rust:skia ~ ts:canvas` is the best structural-conformance shot, _and_ that skia is the deterministic reference the GPU backends are diffed against. These can conflict: matching Chrome's Canvas2D anti-aliasing exactly vs being a clean canonical reference. Which wins when they disagree — match `ts:canvas`, or be the canonical software truth and let `ts:canvas` carry a tolerance? (Recommend: canonical reference; `ts:canvas` diffs within tolerance.)
- **Text without a shaper.** Bronze/Silver return a sentinel (no glyphs) when no full-glyph shaper is registered. Is a no-shaper _box/measure-only_ fallback (draw advance-width boxes) worth it for early bring-up, or does it produce misleading baselines? Lean sentinel/skip to avoid baking wrong pixels into baselines.
- **Multithreaded raster scope.** The tiled/multithreaded raster path (Gold) adds real complexity and nondeterminism risk if tile seams aren't exact. Is software-render throughput actually a goal (it is a _reference_ + _fallback_), or is single-threaded determinism the priority and tiling a non-goal? Weigh before committing to `SkiaTileGrid`.
