---
package: '@flighthq/scene2d-wgpu'
updated: 2026-08-08
by: principal
---

# scene2d-wgpu — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/scene2d-wgpu/src/` (and `scene2d-gl` for the
per-backend comparisons) on 2026-08-08. A file:line here is a claim about this tree, not a session.

- **A tessellated mesh silently drops a full `colorMatrix`.** `drawWgpuShapeMeshes` delegates to the
  color-adjustment fold only when `renderProxy.colorMatrix == null && renderProxy.colorScaleBias
  != null` (`wgpuShapeMesh.ts:101`); otherwise the lean path writes only `mesh.color * alpha`
  (`:74-81`), so a color-matrix-adjusted solid draws its **source** colour. WebGL folds both cases at
  the same seam (`packages/scene2d-gl/src/glShapeMesh.ts:74`, matrix uniforms at
  `glColorAdjustmentMaterialFeature.ts:863-886`), so this is a live per-backend gap, not a shared one.
  A resolved `ColorScaleBias` does fold here. `functional/scenes/swf-color-transform.ts` is the
  four-backend reproducer.
- **The render-stats surface has zero callers.** `recordWgpuBatchFlush` and
  `recordWgpuTextureUpload` (`wgpuRenderStats.ts:16`, `:28`) are exported and invoked from nowhere in
  `packages/` — not from `flushWgpuSpriteBatch`, not from `render-wgpu`'s texture upload. The counters
  read zero unless an application instruments them by hand. The surface is also `./contract`-only; it
  is not in `index.ts`.
- **No 2D coverage query on this backend.** `scene2d-gl` has `explainGlScene2DCoverage` /
  `hasGlScene2DCoverage` (`packages/scene2d-gl/src/explainGlScene2DCoverage.ts`) and `scene3d-wgpu`
  has its 3D twin; there is no `explainWgpuScene2DCoverage`, so a WebGPU state cannot report which
  blend realizations and 2D material renderers it is missing.
- **The shape command vocabulary is still borrowed from Canvas.** `contract.ts:29-47` re-exports
  sixteen `defaultCanvas*` commands under `defaultWgpu*` names, and `@flighthq/scene2d-canvas` remains
  a runtime dependency in `package.json`. Gradient and texture fills have no WGSL-native form.
- **What falls off the mesh lane.** `drawWgpuShape` tries the mesh path and falls through to
  `drawWgpuRasterShape` (`wgpuShape.ts`); a gradient fill, texture fill, or **closed** stroke leaves
  the lane unless `enableWgpuStrokePathTessellation` installs the stroke kernel. A state with no
  `registerWgpuShapeRasterizer` draws those shapes not at all.
- **Every tessellated mesh is its own draw call with a fresh upload.** `wgpuShapeMesh.ts:66-72`
  re-writes the per-mesh vertex and index buffers through `queue.writeBuffer` and issues one
  `drawIndexed` per mesh, per frame — no persistent buffer, no merged batch.
- **Text is rasterized, not atlased.** `wgpuTextLabel.ts` / `wgpuRichText.ts` upload a texture per
  label; `@flighthq/glyphatlas` is referenced from no source file here, and the generated
  [support matrix](../../support-matrix.md) still lists MSDF as `not-implemented`.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The most consequential false claim
  dropped: "`recordWgpuBatchFlush` is now wired into `flushWgpuSpriteBatch`" — a repo-wide grep finds
  **no caller** of any `wgpuRenderStats` recorder outside its own tests, so the stats were reported as
  live while reading zero. Two more went with it: the 2026-06-25 "worktree-vs-assessment discrepancy"
  (`wgpuRendererData.ts` and `wgpuRenderStats.ts` do exist in `src/` now; only `wgpuRegistration.ts`
  never returned), and "tessellated solid shapes never consume `RenderProxy.colorScaleBias`" —
  superseded, the fold handles it; only the full `colorMatrix` case survives, above.
- **2026-08-04** — Tessellated solid fills fold a resolved `ColorScaleBias` through the opt-in
  color-adjustment feature; the untinted path keeps its 64-byte uniform and carries no adjustment
  shader code.
- **2026-08-04** — Recorded the mesh-path colour-adjustment gap against the four-backend reproducer now
  isolated in `functional/scenes/swf-color-transform.ts`.
- **2026-06-25** — Audited every draw path for degenerate input; all already no-op, no edit warranted.
  Per-kind velocity-writer aliases rejected as byte-identical copies of the display-object writer.
- **2026-06-24** — Typed renderer-data helpers (`createWgpuRendererData` / `getWgpuRendererData`)
  added and swept through the five renderer files, removing their `as unknown as` double casts.
