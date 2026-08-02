# Texture Color Space — the decode landed, the encode did not

**Status: proposal, awaiting ruling. Raised 2026-08-01 after measuring a 2D gamma regression in `803d1cf6e`.
Amended 2026-08-02 — the resolver split landed (behaviour-preserving); read the amendment before the
original options section, which it supersedes in part.**

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

## AMENDMENT (2026-08-02) — the seam exists, and the resolver was being lied to

Three findings change the options below. The first two make option (a) far cheaper than it was costed;
the third is a defect in the workaround itself that had to be fixed regardless of which option wins.

**1. The encode seam already exists.** `presentGlRenderEffectResult` (`glRenderEffectPipeline.ts:196`)
already branches on the target's declared space: `'linear'` runs `drawGlLinearToSrgbPass` — its own
comment calls it *"the single gamma encode, never in a material shader"* — and `'srgb'` blits
byte-identically. Intermediate ping-pong targets propagate the declaration. So "2D drawing straight to
the canvas has no present pass to put it in" is true only of the DIRECT-TO-CANVAS path; any 2D content
already running an effect chain has the encode today. Option (a) is not a new architecture for that path.

Encode is not free the way decode is, though, and the asymmetry drives the design: decode is a sample
FORMAT (`SRGB8_ALPHA8` / `rgba8unorm-srgb`, zero cost), while encode is a fullscreen PASS.
`RenderTargetFormat` is `'rgba8' | 'rgba16f' | 'rgba32f'` with no sRGB storage variant, so
`RenderTarget.colorSpace` is metadata the present pass reads rather than a format selector. Adding an
sRGB storage format would make the encode free too — contained, and the thing that would make linear 2D
cheap rather than one-pass cheap.

**2. Premultiply-before-decode is a 2–4x error, and it is the real constraint.** 2D premultiplies at
UPLOAD, on raw encoded bytes (CPU for `Bitmap` via `premultiplyStraightRgba8`, `UNPACK_PREMULTIPLY_ALPHA_WEBGL`
for `Image`). Turn on decode and the sampler returns `decode(c*a)` where a linear compositor needs
`decode(c)*a`:

| c, a | premult-then-decode | correct | error |
|---|---|---|---|
| 0.5, 0.5 | 0.0509 | 0.1070 | 2.10x too dark |
| 1.0, 0.5 | 0.2140 | 0.5000 | 2.34x too dark |
| 0.5, 0.25 | 0.0143 | 0.0535 | 3.73x too dark |

It compounds with the missing encode rather than replacing it, and it only hits TRANSLUCENT pixels — so
it would present as "semi-transparent sprites are wrong" while opaque ones look fine. Option (a) is
therefore three moves, not one: decode on sample, MOVE the premultiply off the upload, encode at present.

**3. The 2D workaround lied to the resolver — fixed, see below.** Passing `'linear'` as the texture's own
colour space to select the no-decode format is false about the data and breaks this field's stated
invariant (*"shaders therefore receive linear values"*): 2D shaders receive sRGB. It also made
"linear because nobody decodes here" and "genuinely linear content" indistinguishable, so flipping 2D to
linear later would first require un-lying every callsite — and a reader who "corrected" it to `'srgb'`
would ship finding 2 silently.

### What was implemented (behaviour-preserving)

One predicate now decides both the sample format and the premultiply point, because the two cannot
disagree — `@flighthq/texture`'s `shouldDecodeTextureOnSample(source, working)`:

| | agree (2D default) | disagree (linear opt-in) |
|---|---|---|
| sample format | `RGBA8`, byte-through | `SRGB8_ALPHA8`, GPU decodes — free |
| premultiply point | on UPLOAD — fast | in the SHADER — must follow the decode |
| present | plain blit | one encode pass (already exists) |

- `Texture.colorSpace` is now always truthful — a 2D sprite says `'srgb'`, because it is.
- The resolvers take `workingColorSpace` (the DESTINATION's space) instead of a colour-space override,
  and derive the sample format from the pair. Rendered output is unchanged.
- `SCENE2D_WORKING_COLOR_SPACE` in `@flighthq/render` declares the 2D tower encoded, in one place, so
  the working space is a single seam rather than a scatter of callsites.

The working space belongs to the TARGET, not a shader: everything drawn into one target must share it or
blending is incoherent.

### What this leaves to rule on

The narrow question is no longer "(a) vs (b) vs (c)" — the resolver split (c) landed as a prerequisite,
and (a) is now a bounded sequence rather than an architectural addition:

1. Thread `RenderTarget.colorSpace` into the resolver as the working space, replacing the constant.
2. Move the premultiply onto the same predicate (shader-side when decoding).
3. Optionally add an sRGB `RenderTargetFormat` so the encode is free.

**The behaviour change that makes this a user decision:** in linear 2D, BLENDING happens on linear
values, so every composite changes — not just texture sampling. Two 50%-alpha sprites over each other
land somewhere different. Usually better, always different, and most 2D content is authored against
sRGB-space blending (Flash, canvas 2D, Photoshop). That is why the fast path should stay the DEFAULT
rather than the fallback, and why linear is opt-in per target.

### Adjacent, and smaller than it looks

Do adjustments and effects need linear? Not uniformly, and not by tier:

- Adjustments FUSE — a stack collapses to one matrix, or to one LUT if any member is LUT-tier
  (`glRenderEffectPipeline.ts:119-121`). A matrix cannot express a gamma round-trip; a LUT can bake
  `decode -> op -> encode` exactly, at one fetch. So linear adjustments cost bake time, never bandwidth
  or batching. Most want gamma anyway (brightness/contrast, hue/saturation, invert, sepia carry Flash /
  Photoshop / CSS expectations); `exposure`, `colorBlindSimulation` (Brettel/Vienot is defined on linear
  RGB) and luma-weighted ops like `grayscale` genuinely want linear.
- Effects SPLIT. Energy-summing ops want linear (blur, bloom, glow, DOF, motion blur, god rays,
  convolution). Others are DEFINED in gamma and running them linear is non-conformant: `blendEffect`
  (the AdvancedBlendMode set is specified on gamma values by PDF/CSS), `fxaa` (operates on gamma-encoded
  luma by construction), `dither`, `filmGrain`.

So the working space wants to be declared per effect/adjustment, the same way pointwise-vs-spatial
already declares the tier. Open: whether a gamma-defined effect inside a linear chain should force a
round-trip mid-chain — correct, but a real pass cost, and the one thing here that does not fall out of
the architecture on its own.

### Alpha encoding, which is a different axis entirely

`alphaType` (storage encoding) and `colorSpace` (sample-time interpretation) are orthogonal — `AlphaType`'s
own doc says so. `Texture` carries no `alphaType`; alpha encoding lives on the SOURCE.

- `Bitmap` declares it, and both uploaders already honour it
  (`premultiply && bitmap.alphaType !== 'premultiplied'`). No double-multiply.
- `Image` does NOT declare it, and `uploadGlImageResource` sets `UNPACK_PREMULTIPLY_ALPHA_WEBGL`
  unconditionally. Safe today because browser PNG/JPEG decode yields straight — but iOS `CGImage` and
  Android `Bitmap` commonly premultiply on decode, so this becomes the DEFAULT case the moment a native
  host decodes. Add the field when the first native decode path lands, not "eventually".
- 3D MESH materials assume straight and cannot represent otherwise: they upload with `premultiply=false`,
  there is no un-premultiply anywhere on the upload path, and the tail premultiplies again. A
  premultiplied `Bitmap` on a 3D material double-darkens, undetectably. 3D PARTICLES are consistent
  (they request premultiplied and their shader emits premultiplied), as is all of 2D.

(`packages/surface` is untracked stale build output from a package renamed to `bitmap`; `Surface` does
not exist. It pollutes repo-wide greps — delete it locally.)

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
