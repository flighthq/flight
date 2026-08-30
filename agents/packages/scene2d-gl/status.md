---
package: '@flighthq/scene2d-gl'
updated: 2026-08-30
by: builder
---

# scene2d-gl — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/scene2d-gl/src/` (and `render-gl`, `types`,
`shape`) on 2026-08-08. A file:line here is a claim about this tree, not about a session.

- **The shape command vocabulary is still borrowed from Canvas.** `contract.ts:31-49` re-exports
  sixteen `defaultCanvas*` commands under `defaultGl*` names, and `@flighthq/scene2d-canvas` remains a
  runtime dependency in `package.json`. Gradient fills and texture fills have no GL-native form; they
  are a canvas replay uploaded as a texture.
- **What falls off the mesh lane, and what happens then.** `drawGlMeshShape` returns false for any
  region without a tessellated form (`glMeshShapeRenderer.ts:22-50`) — gradient fill, texture fill, and
  a **closed** stroke unless `enableGlStrokePathTessellation` installs `tessellateStrokePath`
  (`enableGlStrokePathTessellation.ts:8`). Fill alpha never moves a shape off the lane; an **open**
  stroke stays on it. A state with no `registerGlShapeRasterizer` then draws those shapes **not at
  all** and reports a registry miss (`glShapeRasterizer.ts:9-13`); `explainShapeTessellation` in
  `@flighthq/shape` says which shape and why.
- **Every tessellated mesh is its own draw call with a fresh upload.** `glShapeMesh.ts:55-57` calls
  `bufferData(…, STREAM_DRAW)` for vertices and indices then `drawElements`, per mesh, per frame.
  There is no persistent vertex/index buffer and no `glShapeBatch` merging same-program meshes.
- **Renderer data is reached through `as unknown as` double casts** — `glScale9Shape.ts:53,58,86`,
  `glRichText.ts:42,47,105`, `glShapeData.ts:61,65`, `glTextLabel.ts:49,53`. The WebGPU sibling has a
  typed accessor pair (`packages/scene2d-wgpu/src/wgpuRendererData.ts`); GL has no counterpart, so the
  two backends diverge on the same problem.
- **No context-loss recovery.** Nothing in `packages/scene2d-gl/src` or `packages/render-gl/src`
  mentions `webglcontextlost`. The shader caches are keyed per `WebGL2RenderingContext`
  (`glShapeMesh.ts` `shapeMeshPrograms`, and the clip programs in `glClipContours.ts`) and are never
  rebuilt, so a lost context is unrecoverable without recreating the state.
- **The texture cache never evicts.** `GlRenderState.textureCache` is a
  `WeakMap<CanvasImageSource, WebGLTexture>` (`packages/types/src/GlRenderState.ts:204`), filled at
  `packages/render-gl/src/glDraw.ts:213-225`. No budget, no count, no LRU — VRAM is released only when
  the source image is itself collected.
- **No GL render stats.** `scene2d-wgpu` carries `wgpuRenderStats.ts`; there is no `glRenderStats`
  anywhere in `scene2d-gl` or `render-gl`, so draw-call/instance counts are unobservable on this
  backend.
- **Text is rasterized, not atlased.** `glTextLabel.ts` and `glRichText.ts` upload a texture per
  label; `@flighthq/glyphatlas` is referenced from no source file here, and the generated
  [support matrix](../../support-matrix.md) still lists MSDF as `not-implemented`.

- **`renderGlVelocity` used to leak three context states, and the shape is worth remembering.** It
  restored the framebuffer on exit and nothing else, so `BLEND`, `viewport`, and the clear colour were
  left as the pass set them. The framebuffer restore is what makes this instructive: the function
  clearly knew it had to put things back, and put back exactly one of the four things it changed.
  `BLEND` was the severe one — the 2D path enables it once in `createGlRenderState` and never again, so
  the leak was not frame-scoped but permanent for the context, and `functional/scenes/effect-motion-blur`
  exercises it directly (velocity pass, then `renderGlScene2D`). It is only invisible in that baseline
  because the scene draws solid shapes, where premultiplied blending on and off agree except at
  antialiased edges. Fixed, with all three restores mutation-tested.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — `scene2dGlPipeline` const: turnkey GL pipeline carrying all standard 2D GL renderers, blend modes, shape commands, and effect runners into a single `GlPipeline` value.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Three headline claims checked out
  **false** and were deleted. The largest: `registerGlDisplayObjectRenderers` and its file
  `glDisplayObjectRegistration.ts` **do not exist** — turnkey wiring is `renderGlScene2D` plus the
  `enableGl*` / `registerGl*` set in `index.ts`. Also gone: "GPU stroke tessellation blocked on
  `@flighthq/path`" (`tessellateStrokePath` ships there and is opt-in here), and the whole
  `GlBitmapSamplingLike` thread (the type exists in no `src/` in the repo). Video renderers were
  dropped SDK-wide — no `VideoKind` renderer remains on any backend.
- **2026-08-02** — Measured the mesh-vs-raster lane boundary: alpha never moves a shape off it, a
  closed stroke does; `explainShapeTessellation` answers the question the null used to leave open.
- **2026-06-25** — Typed runtime-slot accessors added for `glShape` / `glTextLabel`, confining the
  `RendererData` cast to one named site per file.
- **2026-06-24** — WebGL1 GLSL upgraded to `#version 300 es` across `glShapeMesh`/`glClipContours`;
  `shapeMeshMatrix` moved to a module-scope `Float32Array(9)` scratch; `makeGlState` exported from
  `@flighthq/render-gl` so this package's tests could run.
