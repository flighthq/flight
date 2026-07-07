# Render Backend Feature Support (current state)

What actually renders on each backend **today**, and the known deltas from the target in [render-architecture.md](render-architecture.md) (which describes the intended end state — e.g. it claims "WebGPU and WebGL2 carry 3D with full parity" and lists Point/Spot lights; several of those are not yet wired). Read this before assuming a feature works on a backend, before scoping a functional test's `renderers`, or before "fixing" a test that fails only on one backend — the failure may be a real renderer gap, not the test.

Findings are empirical (surfaced building the per-primitive functional suite, 2026-06-23) and file-cited. Backends: **canvas** / **dom** are web-only 2D; **gl** / **wgpu** are 2D + 3D. Each capability below is an opt-in where noted (`enable*…Support(state)` / a `register*` call) — absent the opt-in the feature no-ops.

## 2D capability matrix

| Feature | canvas | dom | gl | wgpu | Notes / source |
| --- | --- | --- | --- | --- | --- |
| Per-node `alpha` | ✓ | ✓ | ✓ | ✓ | `HasAppearance.alpha` |
| Per-node `visible` | ✓ | ✓ | ✓ | ✓ | inherits to subtree |
| 2D transform (pos/rot/scale/pivot) | ✓ | ✓ | ✓ | ✓ | `rotation` is **degrees** (`node/transform2d.ts`) |
| Blend modes — full separable set | ✓ | ✓ | ✗ | ✗ | see gap #1 |
| Blend mode `Add` (additive) | ✓ | ✓ | ✓ | ✗ | gl: ok; wgpu: none |
| Clip (rect + contour) | ✓ | ✓ | ✓ | ✓ | opt-in `enable*ClipSupport` |
| Render cache (`cacheAsBitmap`) | ✓ | ~ | ✓ | ~ | opt-in `enable*RenderCache`; bake reachable outside the frame loop only on canvas/gl (dom/wgpu bake in-frame) |
| Stroke caps (none/round/square) | ✓ | ✓ | ✓ | ✓ |  |
| Stroke joins (miter/bevel/round) | ✓ | ✓ | ✗ | ✗ | see gap #2 |
| Shape solid / gradient / bitmap fill | ✓ | ✓ | ✓ | ✓ | bitmap fill tiles from shape-local origin (0,0), not the rect corner |
| Per-**bitmap** `smoothing` flag | ✓ | ✓ | ✗ | ✗ | see gap #3 |
| Per-**instance** ColorTransform tint (quad/tile/node `materialData`) | ✗ | ✗ | ✓ | ✓ | see gap #4; canvas/dom apply node-level material only |
| Text underline | ✓ | ✓ | ✓ | ✓ |  |
| Text strikethrough | ✓ | ✓ | ✗ | ✗ | see gap #5 |
| Text background / border box | ✓ | ✓ | ✓ | ✓ |  |
| Text alignment (center/right) | ✓ | ✓ | ✓ | ✓ | but needs `multiline:true`+`wordWrap:true`, see gap #7 |
| Sprite / QuadBatch / Tilemap | ✓ | ✗ | ✓ | ✓ | no DOM renderer for the atlas-batch primitives |
| Scale9 (nine-slice) | ✓ | ✓ | ✓ | ✓ | dom needed a barrel fix (now exported) |
| Video | ✓ | ✓ | ✓ | ✓ |  |

## 3D capability matrix (gl / wgpu only — canvas/dom are 2D)

| Feature | gl | wgpu | Notes / source |
| --- | --- | --- | --- |
| Mesh geometry (box/sphere/plane/cone/cylinder/…) | ✓ | ✓ | unlit + the 20-material taxonomy |
| Mesh transform (`mesh.localMatrix`) + parent-hierarchy composition | ✓ | ✓ | `node/transform3d.ts` world = parent×local |
| Depth occlusion | ✓ | ✓ | depth-stencil in the effect pipeline |
| Perspective projection | ✓ | ✓ |  |
| Orthographic projection | ✓ | ✗ | see gap #6 — **blank on wgpu** |
| Ambient + Directional lights | ✓ | ✓ |  |
| Point / Spot / Hemisphere lights | ✗ | ✗ | see gap #8 — descriptors exist, renderer does not consume them |

## Known gaps (renderer not at parity — scope tests, don't fight them)

1. **Blend modes are uneven.** Canvas (`globalCompositeOperation`) and DOM (CSS `mix-blend-mode`) do the full separable set. **gl** (`WEBGL_BLEND_MODE` table in `packages/render-gl/src/glDraw.ts`) uses fixed-function `blendFunc` and maps only `Normal`/`Layer` + `Add`; every other mode is `null` → silently falls back to Normal. **wgpu** bakes blend into the immutable render pipeline and honors **no** per-node `blendMode` (not even Add). Tests: `node-blend-modes` (canvas/dom/webgl, asserts Add) + `node-blend-modes-advanced` (canvas/dom, Multiply/Screen).
2. **Stroke join styles not differentiated on gl/wgpu.** The GL shape-stroke tessellation has no miter/bevel/round join handling (caps DO work). Test `shape-stroke-joints` scoped to canvas/dom.
3. **Per-bitmap `smoothing` ignored on gl/wgpu.** `bindGlTexture` (`packages/render-gl/src/glDraw.ts`) sets the texture min/mag filter from the **global** `state.allowSmoothing`, not the per-bitmap flag (and the texture is element-keyed cached, so the first draw's filter sticks). Test `bitmap-downscale-smoothing` scoped to canvas/dom.
4. **Per-instance ColorTransform tint is gl/wgpu only.** Only `registerGlColorTransformMaterial` / `registerWgpuColorTransformMaterials` exist; Canvas/DOM bitmap renderers have no color-transform material renderer, so a `materialData` ColorTransform draws untinted there. (`bitmap-color-transform` sidesteps this by tinting source pixels via `applySurfaceColorTransform`, which is cross-backend.)
5. **Text strikethrough not drawn on gl/wgpu** (the gl/wgpu RichText renderers handle `underline` but not `strikethrough`). Test `text-strikethrough` scoped to canvas/dom.
6. **Orthographic projection renders blank on wgpu** (perspective is fine). Almost certainly a clip-space z-range issue — WebGPU NDC z is `[0,1]` vs WebGL `[-1,1]`, and the ortho matrix is not remapped for it. Test `camera-orthographic` scoped to gl (its `render.webgpu.ts` removed).
7. **Single-line RichText alignment renders nothing.** `align:'center'/'right'` produces no output unless `multiline:true` + `wordWrap:true` give the line a width box. Alignment itself is implemented (`textLayout.ts`).

## Feature gaps (not implemented at all — implement before testing)

8. **Punctual lights.** `createPointLight` / `createSpotLight` / `createHemisphereLight` exist as data in `@flighthq/lighting`, but `SceneLights` (`packages/types/src/SceneLights.ts`) carries only `{ ambient, directional }` and the forward renderer does not consume punctual lights yet (the type comment: "grows to `MAX_FORWARD_LIGHTS` … in later passes"). Not testable until wired.
9. **Group/layer blend.** A `blendMode` on a container (so the whole subtree composites as one layer) needs render-to-texture flattening; unverified whether the renderer does this. Treat as a gap until confirmed.
10. **TextureAtlasRegion pivot.** `pivotX/pivotY` on an atlas region are reported (audit, unverified) as stored but never read by the sprite renderers.

When you close one of these, update this table and un-scope the corresponding functional test's `renderers`.

## Related docs

- [render-architecture.md](render-architecture.md) — the **target** render/scene architecture (this doc is the current delta from it).
- [`functional-test` skill](../.claude/skills/functional-test/SKILL.md) — authoring a visual test; scope backends via `"renderers": [...]` in the test's `package.json`.
