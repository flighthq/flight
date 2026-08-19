# Effect-pass UV origin: sweep and architecture record

Status: source sweep and Y-only-reflection correction complete; architecture decision proposed; no
implementation in this change.

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
| observable with current or existing non-symmetric options | 10 | Bevel, Dither, DirectionalBlur, DropShadow, FilmGrain, GradientBevel, Halftone, InnerShadow, LensDirt, MotionBlur |
| parameter/content/precision-dependent observability | 6 | ChromaticAberration, Convolution, Kuwahara, LensFlare, Pixelate, RadialBlur |
| Y-reflection-equivariant today, so the divergence is hidden | 16 | Bloom, Blur, CameraMotionBlur, ContactShadows, Fxaa, GradientGlow, InnerGlow, LensDistortion, Median, OuterGlow, Outline, Sharpen, Sketch, Smaa, Ssao, Vignette |
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
| ChromaticAberration | The centred radial construction would commute with Y reflection, but both shaders normalize `centered + vec2(1e-5)`. Under `R(x, y) = (x, -y)`, the Y component of that bias must change sign; adding the same positive Y bias in both coordinate systems produces slightly different radial directions. The horizontal-only mode is unaffected. | Replace the two-axis bias with an origin-independent zero-length guard, then verify the radial mode on asymmetric content. The source defect is small enough that an 8-bit capture may hide it, so capture equality alone is not a proof. |
| DirectionalBlur | Both shaders construct `d = (cos(angle), sin(angle))`. The GL sample line appears on screen as `R(d) = (d.x, -d.y)`, while WGPU uses `d`. Symmetric `+t/-t` taps identify `d` with `-d`; they do not identify `d` with `R(d)` for a diagonal angle. | The existing `angle = 0.5` scene is already a diagonal probe. Negate the GL Y component or express the angle in the eventual common position-UV convention; axis-aligned tests are insufficient. |
| Kuwahara | Reflection permutes the four sampled quadrants. With a unique minimum-variance quadrant the output is equivariant; exact variance ties can select a different first quadrant with a different mean. This origin defect is separate from the already-open shared defect where both backends offset the source by `(-r, -r)` and degenerate three quadrants while `computeKuwaharaSectorOffsets` contains unused correct sector math. | Include a constructed tie case or make tie behavior origin-independent. Keep the origin repair and the quadrant repair in separate commits unless evidence proves they share one cause. |
| LensFlare | The centre-directed ghost train commutes with Y reflection, but the halo repeats ChromaticAberration's `normalize(toCenter + vec2(1e-5))` bias. Its Y component is not reflected, so the halo sample is source-level divergent even though the discrepancy may be subpixel. | Replace the bias with an origin-independent zero-length guard and verify the halo separately from the already-correct ghost train. |
| MotionBlur | The velocity buffers store the same Y-down screen-space `(vx, vy)` values on both backends. WGPU converts that vector directly to the intended UV line; GL also uses it directly even though its texture Y axis is opposite, so a displayed GL smear follows `(vx, -vy)`. Symmetric taps erase only `v` versus `-v`, not that Y-only reflection. The horizontal `effect-motion-blur` scene hides the defect, while diagonal particles in `particle-motion-blur` expose it. | Convert the GL screen-space velocity to GL texture space by negating its Y component. Keep a diagonal-velocity assertion; horizontal and vertical vectors each describe the same unoriented line after reflection and cannot detect this defect. |
| Pixelate | Block-centre quantization is reflection-equivariant only when the target height divides into an integral block grid (the current 600/24 scene does). Other supported sizes leave a different remainder at the top versus bottom. | Verify a size that does not divide the target height as well as the existing size 24 case. |
| RadialBlur | A centred `centerY = 0.5` reflects onto itself, which hides the mismatch in the current functional scene. The public off-centre parameter does not. | Verify with an off-centre Y value such as 0.3. |

## Corrected Y-only-reflection audit of the former hidden group

The original audit used an over-broad shortcut: a symmetric tap set is unchanged when a direction is
fully inverted, `d -> -d`, but the backend seam reflects only Y, `R(d) = (d.x, -d.y)`. Those operations
coincide only on an axis. A diagonal line through the origin is unchanged by full inversion and changed
by Y reflection. Applying that distinction to all 20 formerly hidden pairs gives these source results:

| pair | Y-only-reflection result | source reason |
| --- | --- | --- |
| Bloom | genuinely equivariant | Its bright/composite passes are direct samples; the blur is the same separable axis-aligned Gaussian as Blur. |
| Blur | genuinely equivariant | Horizontal taps are unchanged and vertical taps are permuted by Y reflection with equal weights. |
| CameraMotionBlur | genuinely equivariant | The one-way path to fixed centre `(0.5, 0.5)` itself reflects correctly; this does not rely on symmetric taps. |
| ChromaticAberration | **defect** | The radial direction's `vec2(1e-5)` normalization bias does not reflect in Y. |
| ContactShadows | genuinely equivariant | It delegates to the current SSAO approximation's symmetric axial neighbourhood. |
| DirectionalBlur | **defect** | A diagonal `(cos(angle), sin(angle))` line reflects to a different line; `+t/-t` symmetry only removes full sign. |
| Fxaa | genuinely equivariant | Reflection transforms its derived edge direction to `-R(d)`; its `+/-` line taps erase that additional full sign. |
| GradientGlow | genuinely equivariant | Its positional stage is the separable axis-aligned EffectBoxBlur; ramp lookup and compositing are direct. |
| InnerGlow | genuinely equivariant | Its positional stage is the same box blur; tint, clip, and composite are direct samples. |
| LensDistortion | genuinely equivariant | The fixed-centre radial polynomial uses only a reflected centred vector and its squared length. |
| LensFlare | **defect** | The ghost train reflects correctly, but the halo direction has the same unreflected `vec2(1e-5)` Y bias. |
| Median | genuinely equivariant | Y reflection permutes the same square sample multiset, which is sorted before selecting the median. |
| MotionBlur | **defect** | A shared Y-down screen velocity becomes `(vx, -vy)` on GL's texture axis; a diagonal line is not repaired by symmetric taps. |
| OuterGlow | genuinely equivariant | Its positional stage is the separable axis-aligned EffectBoxBlur; tint and compositing are direct. |
| Outline | genuinely equivariant | Y reflection negates the Sobel Y component and preserves X; the shader emits only gradient magnitude. |
| Sharpen | genuinely equivariant | Its Laplacian gives equal weight to the exchanged north/south neighbours. |
| Sketch | genuinely equivariant | Like Outline, it reduces the reflected Sobel vector to magnitude. |
| Smaa | genuinely equivariant | The current approximation uses a symmetric axial cross for both detection and averaging. |
| Ssao | genuinely equivariant | The current approximation sums equal absolute luminance differences over a symmetric axial cross. |
| Vignette | genuinely equivariant | Its fixed-centre result depends only on the length of the reflected centred vector. |

The 16 “genuinely equivariant” verdicts are mathematical source classifications, not promises of
cross-API bit identity: a compiler may still reassociate floating-point sums. They mean that the Y-origin
seam does not change the intended sampled points or scalar result. `DirectionalBlur`, `MotionBlur`,
`ChromaticAberration`, and `LensFlare` do change intended sample positions and therefore move into the
source-confirmed defect set.

Hidden is not absent. A later asymmetric tap weight, off-centre parameter, directional output, or changed
tie-break can make any of the 16 visible without touching the backend seam. Future proofs must name the
exact operation they exclude; invariance under `d -> -d` is never shorthand for invariance under `R(d)`.

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
3. migration of all 45 paired effects; the paired shared executable modules `ColorLutPass`,
   `ColorMatrixPass`, `EffectBlitShader`, `EffectBoxBlur`, `EffectGradientRamp`, and
   `EffectTintShader`; and GL-only `BokehDepthOfFieldEffect` to the correct screen or data sampler.
   `ColorLutPass` and `EffectGradientRamp` are the concrete LUT/ramp cases that prove why data samplers
   cannot inherit the screen-texture flip;
4. removal/re-expression of all seven current hand compensations;
5. a renamed GL `CustomShaderEffect` ABI: changing the meaning of `v_texCoord` silently would leave old
   custom shaders compiling but vertically inverted, so the top-left position varying must take a new
   name such as `v_positionUv` and make old shaders fail explicitly until migrated;
6. re-verification of every affected paired, shared, and GL-only module in the same landing.

Sequence this migration **after** the WGPU antialiasing work, not concurrently with it. Both are atomic
changes in the WGPU effect path; overlapping them would make the combined visual diff impossible to
attribute or review.

The verification set must contain asymmetric probes, not only scenes whose symmetry hides the seam,
and those probes must land **with** the migration rather than in a follow-up. Sixteen of the 45 pairs are
source-level Y-reflection-equivariant today, while other current inputs hide parameter-dependent defects;
landing the convention without the probes would therefore leave much of the migration unobserved:

- a 2x2 labelled-corner texture proves direct sampling remains upright while position UV is top-left;
- off-centre GodRays, TiltShift, and RadialBlur prove public Y parameters;
- seeded FilmGrain and LensDirt plus the exact Dither matrix prove procedural coordinates;
- angled Halftone, Bevel, GradientBevel, DropShadow, and InnerShadow prove signed/rotated directions;
- diagonal DirectionalBlur and velocity-driven MotionBlur prove that full-inversion tap symmetry is not
  mistaken for Y-reflection symmetry; radial ChromaticAberration and the LensFlare halo prove that
  zero-length guards do not introduce an origin-dependent directional bias;
- an asymmetric Convolution kernel and non-dividing Pixelate size prove latent options;
- the six pre-existing compensated families plus the recently corrected GodRays pair prove that the
  migration did not double-flip them;
- the reflection-equivariant group still runs pair parity so a hidden divergence is not converted into a
  visible regression.

Until that atomic change is approved and verified, the right action is to preserve the local compensations,
keep real holds in place, and avoid adding another effect-specific flip.
