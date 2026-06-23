# Maturation Roadmap: @flighthq/displayobject-canvas

**Current verdict** — Solid (78/100): a broad, idiomatic Canvas2D leaf backend with full per-kind draw coverage and clean tree-shakable seams; one step from authoritative, held back by registration ergonomics, silent blend-mode degradation, and a few canvas-specific line/pattern quality knobs.

This package is already well past stub stage. Every 2D kind has a `drawCanvas*` + `defaultCanvas*Renderer` pair, the shape command set is comprehensive, and blend/clip/css-filter/cache/material/text-input are all opt-in nullable-hook seams. So the tiers below are not "build the backend" — they are "close the authoritative gap": ergonomics first (Bronze), fidelity + cross-backend conformance second (Silver), and exhaustive coverage + Rust parity third (Gold).

## Bronze

The minimum to make this backend pleasant and correct to consume — the highest-value, lowest-risk closures of the depth-review gaps.

- **`registerCanvasDisplayObjectRenderers(state)`** — one-call umbrella that wires every `defaultCanvas*Renderer` (`BitmapKind`, `ShapeKind`, `Scale9ShapeKind`, `SpriteKind`, `TilemapKind`, `QuadBatchKind`, `ParticleEmitterKind`, `TextLabelKind`, `RichTextKind`, `VideoKind`, `DisplayObjectKind`) into the render registry. Thin re-export so it stays tree-shakable when unused; replaces ~12 hand-written `registerRenderer` calls. This is the single biggest ergonomics win called out in the review. Mirror the kind-list ordering in a sibling `registerCanvasRendererEntries` data array so the GL/WGPU backends can copy the shape.
- **Close the expressible blend modes** in `CANVAS_BLEND_MODE`: `BlendMode.Erase → 'destination-out'`, `BlendMode.Alpha → 'destination-in'`. These are faithful Canvas2D equivalents (commonly used with OpenFL masks) currently degrading silently to `source-over`.
- **Document remaining unsupported blend modes** (`Invert`, `Subtract`, `Shader`) explicitly rather than silently degrading — keep the `null` map entries but record them in the conformance/divergence map and add a one-line source comment per entry stating "no faithful Canvas2D equivalent; falls back to normal."
- **Unify the `enable*` naming convention**: pick one of `enableCanvas<Feature>Support` vs `enableCanvas<Feature>` and apply it across `enableCanvasBlendModeSupport`, `enableCanvasClipSupport`, `enableCanvasCssFilterSupport`, `enableCanvasRenderCache`, `enableCanvasTextInput`. (Pre-release: rename freely.)
- **Dashed strokes**: extend `defaultCanvasLineStyle` to read a dash array off the `lineStyle` command and apply `context.setLineDash`/`lineDashOffset` in `flushCanvasShapePath`. Requires the `Shape` `lineStyle` command in `@flighthq/shape` to carry dash data (a `LineDash`/`dashPattern` field defined in `@flighthq/types` first) — surface as a cross-package item if not already present.
- **Confirm and document the mask contract.** `DisplayObjectRenderer` exposes only `createData` + `submit`; `drawCanvasRichTextMask` is the lone exported `*Mask` draw. Verify whether shape/bitmap masks route through `pushCanvasClipContours` (so no per-kind `drawMask` is needed) or whether other kinds silently cannot mask. If uniform, document it; if not, this becomes a Silver gap.

## Silver

Competitive with a well-regarded Canvas2D renderer: full Flash/OpenFL `lineStyle` fidelity, pattern control, render-target readback, and verified cross-backend consistency.

- **Full `lineStyle` semantics** — `LineScaleMode` (`none`/`normal`/`vertical`/`horizontal`) and `pixelHinting`. Define `LineScaleMode` as a `*Kind`-style string union in `@flighthq/types`. Scale modes that Canvas2D cannot express natively (e.g. non-scaling strokes under a scaled transform) require dividing `lineWidth` by the transform scale at flush time — implement or record in the divergence map.
- **First-class bitmap-fill pattern control** — surface `repeat`/`no-repeat`/`repeat-x`/`repeat-y` and per-pattern smoothing on `beginBitmapFill`/`lineBitmapStyle`, defined as a `BitmapFillRepeat` union in `@flighthq/types`, instead of an internal default.
- **Render-target readback helper** — `getCanvasRenderTargetImageData(target, out?)` and/or `readCanvasRenderTargetPixels(target, rect, out)` writing into a caller-owned buffer, so cache/filter offscreen pixels are reachable. Coordinate ownership with `@flighthq/surface` (it may own the `ImageSource` snapshot path); if so, expose a `CanvasRenderTarget → ImageSource` bridge rather than duplicating pixel-buffer logic.
- **Mask uniformity** — if Bronze finds masking is rich-text-only, add a uniform mask path: route any maskable kind's geometry through `pushCanvasClipContours` (shapes already produce contours; bitmaps via bounds rect), so any display object can serve as a mask, matching OpenFL `mask`.
- **`destroyCanvasRenderTarget(target)`** — explicit teardown verb (frees the offscreen canvas/context-owned resource now) to pair with `createCanvasRenderTarget`; today there is `create`/`resize`/`begin`/`end` but no named destroy. Audit the cache subsystem for the same gap (`destroyCanvasRenderCacheTarget`).
- **Image-smoothing parity in patterns and scale-9** — ensure `imageSmoothingEnabled`/`imageSmoothingQuality` and per-bitmap overrides are honored consistently across `drawCanvasBitmap`, `drawCanvasScale9Shape`, tilemap, and bitmap fills, not just `drawCanvasBitmap`.
- **Cross-backend conformance scenes** — add `tests/functional` scenes (via the functional-test skill) exercising each closed gap (Erase/Alpha blend, dashed strokes, scale-9 smoothing, bitmap-fill repeat) so the raster backends agree (`test:parity`) and each matches its committed baseline (`test:regression`). This is where "matches a good library" becomes verifiable rather than asserted.
- **Sub-pixel / pixel-snapping control** — optional `pixelSnapping` knob on bitmap draw (`auto`/`never`/`always`, OpenFL semantics) defined in `@flighthq/types`, snapping `tx`/`ty` to integers in `setCanvasTransform` when active to kill seams in tiled/UI content.

## Gold

Authoritative / AAA — exhaustive coverage, performance, full error handling, complete tests/docs, and 1:1 Rust-port posture.

- **Performance pass on the draw walk** — minimize `save`/`restore` and `setTransform` churn (the blend map already does per-frame state-change minimization; extend the same discipline to alpha, transform, line/fill style, and `context.filter`). Batch consecutive same-state draws; reuse a single scratch `CanvasShapeDrawState` rather than allocating per `renderCanvasShapeCommands` call (it currently allocates one per shape).
- **Particle-emitter blend & additive fast path** — `drawCanvasParticleEmitter` should honor per-emitter blend mode (additive is the common case) with a state-minimized inner loop, and support per-particle color/tint via `globalAlpha`/composite without per-particle `save`/`restore`.
- **Quad-batch & tilemap tint/colorTransform** — apply `Material`/`ColorTransform` per quad where Canvas2D allows (tint via offscreen multiply pass or `globalCompositeOperation`), or record the exact divergence (Canvas2D cannot do arbitrary per-vertex color) in the conformance map. Document the canonical fallback.
- **Filter completeness via the seam** — beyond the CSS-filter string path, document and test the multi-pass offscreen route for filters CSS cannot express (e.g. displacement-map, convolution), driven through `@flighthq/filters` + `CanvasRenderTarget`. Provide a `CanvasFilterRenderer` registry analogous to `canvasMaterialRegistry` if filters need per-kind canvas backends.
- **Exhaustive error/sentinel discipline** — every lookup (`getCanvasShapeCommand`, `getCanvasMaterialRenderer`, `getCanvasRenderCacheTarget`) returns a sentinel; verify no draw path throws on missing/degenerate input (zero-size targets, empty command buffers, detached canvas, lost context analogue). Add tests for each degenerate case.
- **Full test matrix** — colocated unit test per source file (already present) plus: aliased `out`-param cases for any new readback/transform helpers; jsdom unit coverage for every blend-mode map entry; functional regression baselines for every kind across the raster backends. Run `npm run exports:check` to guarantee every new export has a colocated test.
- **Documentation** — a package-level doc enumerating supported vs unsupported blend modes, line scale modes, and the canonical mask/filter/cache flows, plus the divergence map entries. Make the supported-feature matrix navigable from `@flighthq/types` header comments.
- **Rust-port parity posture** — note in the conformance map that `displayobject-canvas` is **intentionally TS/host-web-only** (per the Rust index: Canvas2D substrate does not exist in the box; software-render parity is provided by `displayobject-skia`). Gold here means the conformance map records the `rust:skia ~ ts:canvas` pairing as the reference relationship, and the canvas functional scenes double as the TS side of that cross-impl comparison — not that a `flighthq-displayobject-canvas` crate is ever built.
- **Vector/path edge cases** — winding-rule correctness for self-intersecting paths, large coordinate precision, NaN/Infinity guards in shape commands, and gradient/pattern matrix edge cases (singular fill matrices already guarded; extend to stroke patterns). Bezier flattening tolerance parity with the GL/skia tessellators where shapes are rasterized identically.

## Sequencing & effort

Recommended order, with dependencies and items to surface:

1. **Bronze, in order** (small, mostly in-package, ~1–2 sessions):
   - `registerCanvasDisplayObjectRenderers` first — pure ergonomics, no type changes, immediately unblocks every consumer and example. Establish the shared kind-list shape so GL/WGPU copy it.
   - Erase/Alpha blend map entries + documenting `Invert`/`Subtract`/`Shader` — a few lines, plus a divergence-map entry.
   - `enable*` naming unification — mechanical rename; run `npm run order:fix`, `npm run api`, `npm run fix`.
   - Dashed strokes + mask-contract confirmation — these touch `@flighthq/types`/`@flighthq/shape` (dash data on the `lineStyle` command); do the type/header change first, then the canvas draw.
2. **Silver** (moderate, several sessions; some cross-package):
   - `LineScaleMode`, `BitmapFillRepeat`, `pixelSnapping` all need **types defined in `@flighthq/types` first** (header layer) and the `Shape`/bitmap data carriers extended in their owning packages — surface these as cross-package design items before implementing in canvas.
   - Render-target readback needs a **design decision with `@flighthq/surface`**: does canvas expose raw `ImageData`, or a `CanvasRenderTarget → ImageSource` bridge? Decide ownership before building to avoid a duplicate pixel path.
   - `destroyCanvasRenderTarget`/cache destroy — in-package, do alongside readback.
   - Functional conformance scenes — depends on the above features existing; author them as each Silver feature lands so parity/regression baselines accrue incrementally.
3. **Gold** (large, ongoing): performance and exhaustive edge/error coverage are continuous rather than one task. The Rust-parity posture is a **conformance-map documentation decision** (record `rust:skia` as the canvas reference), not code in this package — surface it to whoever owns `tools/agents/docs/rust/conformance.md`.

**Cross-package / design-decision items to surface explicitly:**

- Dash data, `LineScaleMode`, `pixelHinting`, `BitmapFillRepeat`, `pixelSnapping` — all are `@flighthq/types` header additions plus `@flighthq/shape` data-carrier changes; canvas is a consumer, not the owner.
- Render-target pixel readback ownership boundary with `@flighthq/surface`.
- The umbrella-registration shape should be agreed once and mirrored across `displayobject-gl`/`displayobject-wgpu` so the three backends register identically — a cross-backend symmetry item, not canvas-local.
- Per-vertex/quad tint feasibility on Canvas2D is a known divergence; the decision is _how to document/fallback_, recorded in the conformance map, not whether to fully implement.
