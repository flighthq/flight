# Texture Color Space — the decode landed, the encode did not

**Status: proposal, awaiting ruling. Raised 2026-08-01 after measuring a 2D gamma regression in `803d1cf6e`.**

Read before touching `Texture.colorSpace`, `resolveGlTexture` / `resolveWgpuTexture`, the `bind*Texture`
uploaders, or before adding any color-space-aware operation to the 2D path. The immediate question is
narrow — should 2D textures decode to linear? — but it opens the wider one this document exists to settle:
**where does Flight encode, and what color space is a render target in?**

## The claim

Flight now has a **half-migration**. `Texture.colorSpace` selects the GPU internal format, so the sampler
returns linear values. Nothing in the 2D path ever encodes them back. 3D gets away with it because it has
a present pass; 2D draws straight to the canvas and ships linear values into an 8-bit sRGB surface.

The symptom is exactly the one the codebase already names for 3D, in
`packages/scene3d-gl/src/enableGlScene3DColorSpaceGuards.ts`:

> `drawGlScene3D: scene drawn directly to the canvas — linear radiance is not sRGB-encoded (output will be dark).`

2D now has that bug, with no guard and no encode.

## How it got here

`TextureColorSpace` was introduced by `60e980e0e` (2026-07-18) for **glTF import**, which requires the
distinction: baseColor and emissive are sRGB, normal and metallicRoughness are linear. The field was
correct and necessary for that job.

It then sat **unconsumed for two weeks**. `803d1cf6e` (2026-07-31) wired it up — legitimately, since an
unread required field is a latent bug — but the consumption point is the *shared* texture resolver:

```
packages/render-gl/src/glTextureResolver.ts     resolveGl*Texture   → bind*Texture(..., texture.colorSpace)
packages/render-wgpu/src/wgpuTextureResolver.ts resolveWgpu*Texture → bind*Texture(..., texture.colorSpace)
```

Ten 2D renderers route through that resolver — `glSprite`, `glTilemap`, `glBitmapText`, `glQuadBatch`,
`glParticleEmitter2D` and their wgpu siblings. `createTexture` defaults `colorSpace: 'srgb'`
(`packages/texture/src/texture.ts:115`), so every 2D texture silently switched to `SRGB8_ALPHA8` /
`rgba8unorm-srgb` and started decoding on sample. `grep` finds no sRGB encode anywhere in `scene2d-gl` or
`scene2d-wgpu` — only test fixtures.

So the field's design intent (3D/glTF) and its consumption point (shared with 2D) are at different
altitudes. That mismatch is the actual defect, not the wiring commit.

## Measured impact

Paired full-suite capture at `803d1cf6e^` and at HEAD, plus a repeat HEAD run for a noise floor
(3/132 legs nondeterministic, disjoint from the result):

**28 legs changed, reproducibly.** 11 are 3D (the intended half — `srgbToLinear` moved out of the
preludes into the sample format). **17 are the 2D regression**: `benchmark`, `bitmap`,
`bitmapfont-generate`, `particles`, `spritesheet`, `tilemap`, `video` on both GPU backends, plus
`particleeditor/webgl`, `platformer/webgpu`, and `cross-backend-embed/dom` (its DOM scene mounts a live
WebGL canvas, so GL output reaches the DOM screenshot).

Pixel diff on `spritesheet/webgl`, 800×600: **2.8% of subpixels changed, mean |Δ| 47.56/255 (~19% of
full range) over the changed subpixels, max 74.** Sprites got darker. Direction matches the 3D guard.

## Why no gate caught it

Two independent gate failures, each worth its own ruling:

1. **The perceptual regression metric dilutes localised error.** That 47.56/255 local shift scored
   **1.35 whole-frame against a tolerance of 5** — a pass. Averaging over a mostly-empty frame makes the
   tier blind to exactly this class. Area-weighted or per-region scoring would catch it.
2. **The regression tier is excluded from CI** by design (`.github/workflows/tests.yml`, "environment-coupled
   to its committed fingerprint baselines"). Combined with (1), nothing on the PR path can see a gamma shift.

`npm run check` is green at HEAD. Nothing pins the resolver's colorSpace → internal-format mapping.

## The question to rule on

Narrow, needed to clear the regression:

- **(a) 2D decodes and encodes.** Add an sRGB encode to the 2D output path. Correct, but 2D drawing
  straight to the canvas has no present pass to put it in — this implies a 2D present/resolve stage, which
  is a real architectural addition.
- **(b) 2D stays in sRGB space.** Default 2D textures to `linear` (i.e. do not forward `colorSpace` from
  the 2D resolvers), keeping 2D byte-through as it was. Cheap and restores prior behavior, but leaves
  `Texture.colorSpace` meaning different things depending on which renderer samples it — the altitude
  mismatch stays.
- **(c) Split the resolver.** 3D consumes `colorSpace`; 2D does not, explicitly and by name. Makes the
  split visible rather than incidental, at the cost of two resolver families.

Wider, and the reason this deserves a session rather than a patch:

- What color space is a `RenderTarget` in? `packages/render/src/renderTarget.ts:112` already defaults
  `colorSpace: 'srgb'`, and both effect pipelines default their scene target to `'srgb'` — so a
  target-based 2D path may already have the encode seam this needs.
- Is "linear working space" a property of the scene graph, the target, or the backend?
- Does the 3D canvas guard generalise to a single rule both towers obey, instead of one guard per tower?

## Relationship to approved work

Touches the same seam as [render view model](render-view-model.md) — if `RenderView` becomes the windowless
render primitive, it is the natural home for a present/encode stage, which is option (a)'s missing piece.
Rule on these together, or rule on this one in a way that does not foreclose that.

Also adjacent: [texture source model](texture-source-model.md) owns `Texture` shape;
[effect / adjustment / material](effect-adjustment-architecture.md) owns the pipelines that already
carry a `colorSpace` on their targets.

## Not blocking CI

The 28-leg drift does **not** gate CI: the smoke leg runs `--fail-on-error`, and
`captureSuite.ts:125` only fails on `changed` under `--fail-on-changed`. So this can be ruled on
deliberately. It **does** ship: `edge-publish` gates on `build` + `test-fast` only, so a push to
`develop` or `main` publishes the current 2D behavior under the `next` / `edge` dist-tag.
