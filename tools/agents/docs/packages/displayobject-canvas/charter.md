---
package: '@flighthq/displayobject-canvas'
crate: null
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---


# displayobject-canvas — Charter

## What it is

`@flighthq/displayobject-canvas` is the **Canvas 2D leaf renderer of the display-object subject family** — the `<subject>-<backend>` cell where `<subject>` is `displayobject` and `<backend>` is the browser's immediate-mode Canvas 2D context. It supplies a per-kind `{ createData, submit }` renderer for every display-object node kind (Bitmap, DisplayObject, ParticleEmitter, QuadBatch, RichText, Scale9Shape, Shape, Sprite, TextLabel, Tilemap, Video) over a shared Canvas draw-state spine, plus the shape-command and material seams, blend-mode mapping, clipping, offscreen render targets, and a CSS-filter binding.

It ends where the backend-agnostic core (`@flighthq/render`) ends: `render` owns registration, the render state/queue, the update pipeline, and the draw contract; `displayobject-canvas` owns only the Canvas-specific realization of that contract. It is a sibling to `displayobject-dom` (DOM-element backend) and `displayobject-gl`/`-wgpu`/`-skia` (GPU and portable-software backends): same subject, different substrate. Per the Rust map it is **host-web-only** — there is no `flighthq-displayobject-canvas` crate, because the Canvas 2D substrate does not exist in the Rust box; software-render parity there is `displayobject-skia`.

## North star

- **Faithful immediate-mode realization of the display-object draw contract.** The package's job is to turn an already-prepared render node into Canvas 2D draw calls with the OpenFL/Lime fidelity a user expects — sourceRect, smoothing, blend mode, alpha, scale-9, masking — never to re-implement the scene graph, the update pass, or registration that `render` already owns.
- **Open where the domain is open, closed where it is finite.** Genuinely-extensible axes (shape commands, materials) are open string-keyed registries; genuinely-closed finite enums on a hot path (the `BlendMode` → `globalCompositeOperation` table) stay closed records. The package draws the open/closed line by what the axis actually is, per fork B.
- **Pay-for-what-you-draw.** Single root export, `sideEffects: false`, no top-level registration; every wire-up is an explicit `register*`/`enable*Support` opt-in, and per-draw brackets (material save/restore, blend-mode cache) cost nothing on the common path. A static `RichText` pulls no text-input code.
- **Types live in `@flighthq/types` first.** Cross-package draw-state shape (e.g. `CanvasShapeDrawState`, `strokeScaleMode`) belongs in the header layer so custom registered commands can read and write it — not as module-local fields.
- **Verb and naming discipline.** Full unabbreviated `Canvas` + operated-on-type names; `destroy*` for freeing a non-GC compositor backing store, `release*` reserved for cache-slot brackets, sentinels (`null`/no-op) for expected-absent input, throws only for misuse.

## Boundaries

In scope:

- The Canvas 2D `{ createData, submit }` renderer for every display-object kind, and the umbrella `registerCanvasDisplayObjectRenderers` / `canvasDisplayObjectRendererEntries`.
- The Canvas shape-command spine and its open registry; the Canvas material seam and its registry.
- Canvas blend-mode mapping, clipping/masking, offscreen render targets, render caching, and the CSS-filter binding.

Non-goals:

- Registration, render state/queue, the update pipeline, or the draw contract itself — those are `@flighthq/render`.
- The display-object node types and their data — those are `@flighthq/displayobject` / `@flighthq/shape` / `@flighthq/text`.
- A Rust crate — host-web-only by design; software-render parity is `displayobject-skia`.
- Pixel-buffer manipulation / surface ownership — `@flighthq/surface` (the render-target readback ownership line is an open direction below, not a settled in-scope feature).

## Decisions

- **2026-07-02 — Real canvas backend, implement filters where possible (not just CSS shim).**
- **2026-07-02 — Canvas-raster fallback accepted for GPU backends.**
- **2026-07-02 — No umbrella registerAll — maximum tree-shaking.**
- **2026-07-02 — TS-leads. `crate: null` (browser-API-bound).**

## Open directions

Every item below is a question for the direction pass to settle, not an assumption an agent should make:

1. **Scope of the Canvas backend vs. `displayobject-skia`.** Is `displayobject-canvas` the _primary_ 2D software path (richest fidelity, owns the OpenFL feature target), or the _thin host-web_ path with `skia` as the conformance reference? This decides how hard to push canvas-specific fidelity (dashed strokes, per-axis scale modes) vs. deferring to the shared rasterizer.
2. **Render-target readback ownership.** Does canvas expose raw `ImageData` (`getCanvasRenderTargetImageData` / `readCanvasRenderTargetPixels`), or only a `CanvasRenderTarget → ImageSource` bridge into `@flighthq/surface`? A real API fork that blocks the readback feature and should not be decided silently.
3. **Fidelity floor for unsupported blend modes.** Is "degrade to normal, document it" the accepted posture for `Invert`/`Shader`/`Subtract`, or should canvas gain a pixel-readback path for at least `Invert`? Today it is documented degradation; the charter should bless or reject it.
4. **Where cross-backend conformance scenes live and which backends they target.** Blend/scale-mode features are unverified visually (no functional scenes for Erase/Alpha blend, scale-mode `'none'`, scale-9 smoothing). The charter should name the expectation — canvas ↔ dom ↔ gl parity scenes, plus the `rust:skia ~ ts:canvas` cross-impl pairing — this being the single largest gap to authoritative.
5. **The line between "Canvas command" extensibility and `@flighthq/shape`.** The open `canvasShapeRegistry` lets users add stroke/fill commands; several deferred features (dashed strokes, `BitmapFillRepeat`, pixel-snapping/`pixelSnapping`) are blocked on upstream `lineStyle` tuple changes in `@flighthq/types` + `@flighthq/shape`. Is the command tuple the right extension surface, or should bitmap-fill/dash be first-class typed fields? A boundary question worth a ruling.
6. **`LineScaleMode 'horizontal'` / `'vertical'`.** Currently fall back to `'normal'`; completing them needs per-axis scale decomposition of the canvas transform — within-package but awaiting a direction on whether canvas owns full per-axis scale-mode fidelity (ties to open direction 1).
7. **Image-smoothing parity across kinds.** Smoothing overrides are honored in `drawCanvasBitmap` but not audited across scale-9, tilemap, and pattern fills — is consistent smoothing a contract this backend must hold?
8. **Source-data vs. graph-participation line (fork A).** Several rendered kinds (ParticleEmitter, QuadBatch, Tilemap) carry source data owned elsewhere while this backend draws their participation; the charter should note where the line falls so the renderer never absorbs sim/source state.
9. **Package Map staleness.** The live `tools/agents/docs/index.md` Package Map has no `displayobject-canvas` entry (nor its `displayobject-<backend>` siblings or `@flighthq/clip`); the bundle's evolved map does. Whether to refresh the live map is the user's doc gate, surfaced here.
