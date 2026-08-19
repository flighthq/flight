# Effect-pass UV origin: sweep and architecture record

Status: source sweep complete; architecture decision proposed; no implementation in this change.

## Decision in one sentence

Give every effect fragment shader a top-left-origin, Y-down **position UV**, and make backend-owned
screen-texture sampling helpers translate that position UV into the texture storage convention. Position
math then has one meaning; only code whose job is sampling a backend texture knows about a storage flip.

## The seam

At the same displayed fragment, the current fullscreen passes provide vertically opposite coordinates:

- `packages/render-gl/src/glFullscreenPass.ts` interpolates the quad's bottom-left-origin `a_texCoord`
  directly into `v_texCoord`.
- `packages/effects-wgpu/src/wgpuEffectPass.ts` emits `uv.y = 0` at the top and `uv.y = 1` at the bottom.

If `u` is the WGPU coordinate, the GL coordinate is `R(u) = (u.x, 1 - u.y)`. A raw sampler hides this:
each backend samples the corresponding physical source row in its own storage space. The difference
becomes semantic as soon as a shader uses the coordinate for anything besides a direct sampler argument.
An off-centre point, procedural hash, row index, rotated grid, signed offset, or asymmetric kernel then
receives a different position on the two backends.

The god-rays investigation proved the mechanism with a falsifiable prediction. `centerY = 0.4` named row
240 in the top-left convention but landed at row 360 when passed unchanged into GL's bottom-origin UV;
the predicted 120 px separation matched the observed ray axis. Whole-image flipping, MSAA, one-pixel
alignment, and pre-effect raster differences were each tested and rejected as the cause.

## Sweep predicate and surface

The sweep was re-derived from source, not from the initial candidate roster. It used two stages:

1. Include a GL/WGPU pair when its fragment UV is used as a position anywhere beyond a direct screen
   texture sample, or when the pair delegates to a positional helper.
2. Mark it as a defect candidate when neither sibling normalizes that position's Y convention.

The paired surface contains 45 same-name GL/WGPU effects. Thirty-nine consume positional UV directly or
through a shared helper: 32 are uncompensated candidates and 7 already compensate locally. Six are
direct-sample-only today. The shared `EffectBoxBlur` and `EffectBlitShader` pairs were audited separately
and their callers attributed to the named effects. GL-only `BokehDepthOfFieldEffect` and
`CustomShaderEffect` are outside the pair count; custom shader compatibility is nevertheless part of the
migration blast radius.

| source classification | count | named effects |
| --- | ---: | --- |
| already hand-compensated | 7 | Crt, Displacement, Glitch, GodRays, Scanlines, ScreenSpaceFog, TiltShift |
| observable with current or existing non-symmetric options | 8 | Bevel, Dither, DropShadow, FilmGrain, GradientBevel, Halftone, InnerShadow, LensDirt |
| parameter/content-dependent observability | 4 | Convolution, Kuwahara, Pixelate, RadialBlur |
| reflection-equivariant today, so the divergence is hidden | 20 | Bloom, Blur, CameraMotionBlur, ChromaticAberration, ContactShadows, DirectionalBlur, Fxaa, GradientGlow, InnerGlow, LensDistortion, LensFlare, Median, MotionBlur, OuterGlow, Outline, Sharpen, Sketch, Smaa, Ssao, Vignette |
| direct-screen-sample only, so excluded by the predicate | 6 | Blend, Composite, Posterize, RenderTexture, ToneMap, WhiteBalance |

The last six still have to migrate to the screen-sampling helper in the structural change. Otherwise
normalizing GL's position UV would vertically flip their sampled image.

## Observable and latent cases

| pair | source result | release/verification implication |
| --- | --- | --- |
| Bevel, GradientBevel | Both runners derive the same signed Y light offset and both shaders apply it in opposite UV axes. A vertical light component therefore swaps the physical high/low samples and can swap highlight with shadow. | Verify a non-axis-aligned light and distinguish highlight from shadow, not only edge presence. |
| Dither | Both shaders index the same non-vertically-symmetric 4x4 Bayer matrix with `uv * resolution`. Opposite row origins select different thresholds. | Compare the exact 4x4 phase inside flat fills. |
| DropShadow, InnerShadow | Both delegate to `EffectBlitShader`'s offset pass. GL and WGPU currently add the same numeric Y sample offset in opposite UV axes. The WGPU source comment cites an earlier parity check, but the declared vertex spaces and the shader algebra contradict that comment; the image must be re-measured rather than treating prose as proof. | Verify a 45-degree, nonzero-distance shadow on an asymmetric source, including which side of the source receives it. |
| FilmGrain | The same seed hashes `floor(uv * 1024 / size)`. Vertical reflection feeds a different coordinate to the hash, producing an effectively uncorrelated field rather than a mirrored-looking field. | Same seed and size must produce the same displayed grain cells. |
| Halftone | The dot grid rotates absolute pixel coordinates. At the functional angle `0.4`, vertical reflection changes grid orientation/phase. | This is real in addition to the separate GLSL `mod` versus WGSL signed-remainder translation defect. Fixing either one alone leaves a compounded mismatch; re-verify after both are absent. |
| LensDirt | `dirtAmount(uv, seed)` is another coordinate-seeded procedural field, so the divergence is real. | Manager has already ruled the existing difference in-contract/acceptable. Record it; do not reopen that ruling during this migration without a new decision about which image is canonical. |
| Convolution | Kernel rows are applied to signed Y offsets without reflecting the matrix. Vertically symmetric kernels hide the issue; the public arbitrary matrix permits asymmetric kernels that expose it. | Verify with a deliberately asymmetric kernel whose top and bottom weights differ. |
| Kuwahara | Reflection permutes the four sampled quadrants. With a unique minimum-variance quadrant the output is equivariant; exact variance ties can select a different first quadrant with a different mean. | Include a constructed tie case or make tie behavior origin-independent. |
| Pixelate | Block-centre quantization is reflection-equivariant only when the target height divides into an integral block grid (the current 600/24 scene does). Other supported sizes leave a different remainder at the top versus bottom. | Verify a size that does not divide the target height as well as the existing size 24 case. |
| RadialBlur | A centred `centerY = 0.5` reflects onto itself, which hides the mismatch in the current functional scene. The public off-centre parameter does not. | Verify with an off-centre Y value such as 0.3. |

## Divergent but currently hidden

These pairs still satisfy the positional predicate. They must not be dropped merely because their present
math commutes with vertical reflection:

- Symmetric tap sets hide direction reversal: `Blur`, `DirectionalBlur`, `Median`, and the shared
  `EffectBoxBlur`; `Bloom`, `GradientGlow`, `InnerGlow`, and `OuterGlow` inherit that property.
- `MotionBlur` also uses a symmetric set. Its `count = 16` taps have
  `t = i / (count - 1) - 0.5`, so every `+t` has a `-t`. Reversing a vertical velocity reverses the
  traversal order but not the sampled set. Therefore the UV-origin seam does **not** explain the held
  particle-motion-blur pictures whose blur directions reportedly disagree. That H4 observation remains
  unresolved; this sweep does not establish whether its cause is velocity production/association or a
  different backend seam.
- `CameraMotionBlur` samples toward the fixed centre; reflection maps the whole centre-directed path
  onto itself. `ChromaticAberration`, `LensDistortion`, `LensFlare`, and `Vignette` are likewise centred
  radial constructions. The tiny `vec2(1e-5)` normalization biases in chromatic aberration and lens flare
  prevent claiming bit identity, so both still need verification.
- `Outline` and `Sketch` reduce the reflected Sobel field to gradient magnitude. `Sharpen`, `Ssao`, and
  the `ContactShadows` alias use symmetric neighbour sets. `Fxaa` and `Smaa` derive and sample symmetric
  edge neighbourhoods. Reflection permutes or negates intermediate values without changing the intended
  result.

Hidden is not absent. A later asymmetric tap weight, off-centre parameter, directional output, or changed
tie-break can make any of these visible without touching the backend seam.

## Existing hand compensations

The following source already repairs one positional use locally:

- GL Crt: flips the scanline row.
- GL Displacement: converts the procedural phase to image Y and converts the vertical offset back.
- GL Glitch: flips the procedural block index.
- GL GodRays: the recently corrected runner converts the top-left `centerY` contract into GL texture Y.
- GL Scanlines: flips the row used for the sine phase.
- GL TiltShift: flips the row before comparing it with the top-left focus centre.
- WGPU ScreenSpaceFog: flips the fallback Y ramp to match the GL horizon placement.

They prove that authors have been solving one shared convention manually. They are correct in the current
mixed-origin system and must not be removed independently. In the structural migration, every transform
whose purpose is backend-origin compensation must be removed or re-expressed as backend-neutral effect
intent in the same atomic change. A formula may still contain `1 - y` for a real concept such as distance
from the bottom; it must no longer contain it merely because one backend supplied a different position UV.

## Proposed convention

Use top-left-origin, Y-down position UV on every backend:

- `(0, 0)` is the displayed top-left fragment and `(1, 1)` the displayed bottom-right.
- Public screen-space positions, angles, offsets, procedural seeds, and row/column indices use that space.
- WGPU already supplies this position convention.
- GL changes its fullscreen position interpolation to supply it too.

Top-left is the smaller semantic distance to the rest of the engine: DOM, Canvas, scene coordinates,
capture coordinates, and the now-explicit GodRays `centerY` contract are top-left/Y-down. Choosing GL's
storage convention instead would make every effect author translate ordinary screen coordinates.

Position and sampling must become distinct operations. Effect shader sources should receive backend-owned
helpers conceptually equivalent to:

```text
positionUv                         // always top-left/Y-down
sampleScreenTexture0(positionUv)   // backend maps to texture storage
sampleScreenTexture1(positionUv)   // same rule for depth, velocity, backdrop, etc.
```

For GL screen render targets the helper samples `(uv.x, 1 - uv.y)`; for WGPU it samples `uv`. The flip
belongs inside the screen-texture sampling seam, not in effect math. Lookup/data textures are explicitly
different: gradient ramps, LUT atlases, and other data-coordinate bindings must keep their own sampling
functions and must not receive a blanket Y flip.

Raw `texture(...)`/`textureSampleLevel(...)` calls on screen inputs should no longer be the authoring
surface. Otherwise the convention remains voluntary and the next effect can recreate the defect.

## Atomic migration and blast radius

This cannot ship as a vertex-only flip or as one more per-effect patch. One atomic landing must include:

1. the documented top-left position-UV contract in both fullscreen substrates;
2. backend screen-texture sampling helpers for every screen input binding, including depth and velocity;
3. migration of all 45 paired effects plus `EffectBoxBlur`, `EffectBlitShader`, and shared color/effect
   passes to the correct screen or data sampler;
4. removal/re-expression of all seven current hand compensations;
5. an explicit compatibility decision for GL `CustomShaderEffect`, whose documented author surface exposes
   raw `v_texCoord` and `texture`; silently changing that ABI would invert existing custom shaders;
6. re-verification of every affected pair in the same landing.

The verification set must contain asymmetric probes, not only scenes whose symmetry hides the seam:

- a 2x2 labelled-corner texture proves direct sampling remains upright while position UV is top-left;
- off-centre GodRays, TiltShift, and RadialBlur prove public Y parameters;
- seeded FilmGrain and LensDirt plus the exact Dither matrix prove procedural coordinates;
- angled Halftone, Bevel, GradientBevel, DropShadow, and InnerShadow prove signed/rotated directions;
- an asymmetric Convolution kernel and non-dividing Pixelate size prove latent options;
- the six pre-existing compensated families plus the recently corrected GodRays pair prove that the
  migration did not double-flip them;
- the reflection-equivariant group still runs pair parity so a hidden divergence is not converted into a
  visible regression.

Until that atomic change is approved and verified, the right action is to preserve the local compensations,
keep real holds in place, and avoid adding another effect-specific flip.
