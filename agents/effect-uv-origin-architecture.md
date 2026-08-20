# Effect-pass UV origin: sweep and architecture record

Status: all 45 GL/WGPU pairs audited per path under Y-only reflection; architecture decision proposed;
no implementation in this change.

## Decision in one sentence

Give every effect fragment shader a top-left-origin, Y-down **position UV**, and make backend-owned
screen-texture sampling helpers translate that position UV into the texture storage convention. Position
math then has one meaning; only code whose job is sampling a backend texture knows about a storage flip.

When editing a paired GL/WGPU effect shader that reads position, direction, row phase, or any other
vertical coordinate, run `npm run shader-vertical-origin` and inspect the named pairs. It is a report-only
source heuristic, not a gate: zero findings cannot see one-sided effects, CPU-computed uniforms, or a
conversion spelled differently from subtraction from one, so it complements rather than replaces the
property reasoning and asymmetric functional probe below.

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

## Audit method and corpus result

The earlier source predicates were useful discovery tools, but they were not the property being proved.
This audit therefore ignores syntax and tests the actual property on every implemented path in all 45
same-name GL/WGPU pairs. For a WGPU position `u`, the GL position at the same displayed fragment is
`R(u) = (u.x, 1 - u.y)`; for a displacement, `R(dx, dy) = (dx, -dy)`. A path holds only when applying it
in GL space and then reflecting produces the same displayed sample positions and scalar result as
applying it in WGPU space.

“Path” means a distinct fragment pass or a shader branch with different coordinate behavior. Branches
that differ only in color algebra are grouped after verifying that they use the same direct reads. Shared
blur, tint, clip, blit, and erase passes were checked once and then attributed to every caller. The roster
was derived by set equality over the two backend effect exports, not copied from the earlier buckets.

The result is exhaustive over current paired source:

- 28 pairs hold on every implemented shader path;
- 16 pairs contain at least one source-confirmed non-equivariant path; and
- `RenderTexture` is orchestration only and has no fragment path of its own.

Those categories account for all 45 names exactly once. The audited snapshot includes the corrected GL
GodRays `centerY` conversion and WGPU Halftone's floored-modulo translation. It does not assume the held
DirectionalBlur, MotionBlur, ChromaticAberration, or LensFlare fixes have landed. The Halftone modulo
change removes a GLSL/WGSL translation difference, but it does not change the origin verdict.

These are mathematical source verdicts, not promises of cross-API bit identity: shader compilers can
still reassociate floating-point expressions. “Holds” means the Y-origin seam does not change the
intended sample positions or scalar result.

### Shared pass verdicts

| shared path | Y-only-reflection verdict | callers in the paired corpus |
| --- | --- | --- |
| Gaussian blur, horizontal and vertical passes | **holds**: horizontal offsets are unchanged; reflection permutes vertical `+/-` taps with equal weights | Bloom, Blur, LensDirt |
| EffectBoxBlur, horizontal and vertical passes, including repeated quality passes | **holds** for the same axis-aligned permutation reason | Bevel, DropShadow, GradientBevel, GradientGlow, InnerGlow, InnerShadow, OuterGlow |
| EffectTint and inverse-tint passes | **holds**: direct source-alpha read followed by color-only math | Bevel, DropShadow, GradientBevel, GradientGlow, InnerGlow, InnerShadow, OuterGlow |
| EffectBlit direct and erase passes; inner-clip passes | **holds**: all screen inputs are read directly at the current backend coordinate | all glow, bevel, and shadow recipes that call them |
| EffectBlit offset pass | **defect for nonzero `dy`**: both siblings upload `(-dx / width, +dy / height)`, so the same numeric Y offset maps to opposite displayed directions | DropShadow, InnerShadow |

### All 45 pairs, per path

"**Fails**" means the path is non-equivariant under Y-only reflection absent its local compensation —
it describes the seam's property, not a present-tense bug. Compensated paths note the fix inline;
the "Existing hand compensations" section below lists them all.

| pair | pass/path verdicts under Y-only reflection |
| --- | --- |
| Bevel | Tint **holds**; horizontal/vertical box blur **holds**; source blit, clip modes, and erase **hold**. Directional composite **fails** when the light has a nonzero Y component: both runners upload the same negative numeric Y offset, attaching highlight/shadow to opposite displayed sides. |
| Blend | Missing-backdrop fallback and dual-source reads **hold**. Normal and every advanced blend-mode branch are color-only after direct layer/backdrop samples, so all **hold**. |
| Bloom | Bright-threshold pass **holds**; Gaussian horizontal/vertical passes **hold**; direct scene/blur composite **holds**. |
| Blur | Gaussian horizontal and vertical passes both **hold**. |
| CameraMotionBlur | The one-way march from each position toward fixed centre `(0.5, 0.5)` **holds**; the path itself reflects correctly and does not rely on symmetric taps. |
| ChromaticAberration | Horizontal-only RGB offsets **hold**. Radial mode **fails** absent compensation: the unreflected `vec2(1e-5)` epsilon would add a positive Y bias in both coordinate systems instead of reflecting it. Compensated locally with `vec2(1e-5, -1e-5)`. Direct centre/alpha reads **hold**. |
| Composite | Missing-backdrop fallback and direct layer/backdrop reads **hold**; every Porter-Duff operator branch is color/alpha-only and **holds**. |
| ContactShadows | Its only current path delegates to the SSAO approximation; the symmetric axial neighbourhood **holds**. |
| Convolution | Direct centre-alpha restoration and the clamp/edge-color boundary branches **hold**. Kernel accumulation **fails** for the public general matrix because row weights are not reflected. An odd-height kernel holds only when its rows are vertically palindromic; an even-height kernel has an asymmetric offset set and holds only in degenerate cases where the unmatched outer weight is zero and the remaining signed-offset weights are symmetric. |
| Crt | Fixed-centre barrel transform and bounds **hold**; horizontal RGB split **holds**; GL's `1 - uv.y` scanline phase versus WGPU's `uv.y` **holds**; fixed-centre vignette **holds**. |
| DirectionalBlur | The direct base path **holds**. The symmetric tap line **fails** absent compensation for a diagonal angle: `+/-` symmetry erases full sign but not Y-only reflection, and horizontal/vertical axes alone hide the defect. Compensated locally by negating `sin(u_angle)`. |
| Displacement | Procedural phase **holds** because GL uses image Y and WGPU uses its native top-left Y; horizontal warp **holds**; GL's negated vertical sample displacement versus WGPU's positive displacement **holds**. |
| Dither | Direct source read and color quantization **hold**. Bayer lookup **fails** because reflected pixel rows index a different phase of the non-vertically-symmetric 4x4 matrix. |
| DropShadow | Tint **holds**; box blur **holds**; direct blit/erase modes **hold**. The shared offset-blit path **fails** for nonzero `dy`. |
| FilmGrain | Direct source read and color mix **hold**. The `floor(uv * 1024 / size)`-seeded hash **fails** because reflected Y produces a different grain field. |
| Fxaa | Centre and diagonal-neighbour reads **hold as a reflected set**; the no-edge direct branch **holds**. Reflection maps the derived direction to `-R(d)`, and the later symmetric line taps erase that extra full sign, so both blend branches **hold**. |
| Glitch | GL's image-Y block index versus WGPU's native Y **holds**; the resulting tear, corruption choice, horizontal displacement, and horizontal RGB split all **hold**. |
| GodRays | Direct base read and ray march **hold** after the GL runner converts public top-left `centerY` to GL texture Y. The formerly dead `u_resolution` uniform has been removed. |
| GradientBevel | Tint **holds**; box blur **holds**. Directional bevel encode **fails** for a nonzero Y light component because both runners upload the same negative numeric Y offset. Ramp lookup, source-alpha clip, direct blits, and erase **hold**. |
| GradientGlow | Tint **holds**; box blur **holds**; scalar gradient-ramp lookup **holds**; direct blit/erase compositing **holds**. |
| Halftone | Direct source/luminance path **holds**. Rotating the absolute pixel grid and wrapping it into cells **fails** generically under Y reflection, changing grid orientation or phase. WGPU's floored modulo now matches GLSL for negative rotated coordinates, but that separate fix does not make the grid equivariant. |
| InnerGlow | Inverse tint **holds**; box blur **holds**; direct inner clip and blit paths **hold**. |
| InnerShadow | Inverse tint **holds**; box blur **holds**; direct inner clip and blits **hold**. The shared offset-blit path **fails** for nonzero `dy`. |
| Kuwahara | Direct centre-alpha restoration **holds**. Sector sampling **fails generically in current source**: the `sign(lo[q] + 1)` formula degenerates the four intended quadrants into one corner, one row, one column, and one quadrant, and those four sample sets do not permute under Y reflection. |
| LensDirt | Bright-threshold pass **holds**; Gaussian horizontal/vertical blur **holds**; direct scene/bright composite reads **hold**. The seeded `dirtAmount(uv, seed)` mask **fails** because its fixed hashed centres are not reflected between backends. |
| LensDistortion | Fixed-centre radial polynomial, bounds branch, and direct sampling all **hold**. |
| LensFlare | Direct scene read **holds**; the centre-directed ghost train **holds**. The halo **fails** absent compensation: the unreflected `vec2(1e-5)` epsilon would repeat ChromaticAberration's positive Y bias. Compensated locally with `vec2(1e-5, -1e-5)`. |
| Median | Square-neighbour collection **holds as a reflected multiset**; sorting that multiset and selecting its median **holds**; direct centre alpha **holds**. |
| MotionBlur | **BLOCKED pending task 118.** A live render measurement used a colour-change positive control (40,000 differing pixels), then found 0 differing pixels for the `(0, 0)` to `(0, 40)` velocity A/B and for removing MotionBlur entirely. The current scene therefore cannot decide the rendered origin verdict: the whole effect is inert. The conditional source result still says the velocity-driven tap line **fails** absent compensation for diagonal motion, so GL retains the local `velocityPixels.y` negation; that same-method source result is not picture corroboration. |
| OuterGlow | Tint **holds**; box blur **holds**; direct blit/erase compositing **holds**. |
| Outline | The reflected Sobel neighbourhood preserves X gradient and negates Y gradient; magnitude and direct alpha paths therefore **hold**. |
| Pixelate | Block-centre quantization **holds** when `height / size` is integral, away from exact quantizer boundaries. It **fails** for the supported general case with a non-integral vertical block count because top and bottom leave different remainders. |
| Posterize | Direct source read followed by channel-only quantization **holds**. |
| RadialBlur | The fixed-centre case `centerY = 0.5` **holds**. The same ray-march path **fails** for a general off-centre public `centerY` because GL forwards it without converting to GL texture Y. |
| RenderTexture | **No shader path of its own.** It resolves registered runners and ping-pongs targets; each chain member inherits that effect's verdict, and the orchestration introduces no additional coordinate operation. |
| Scanlines | Direct source read **holds**; GL's `1 - uv.y` row phase versus WGPU's native `uv.y` **holds**. |
| ScreenSpaceFog | Direct scene read **holds**. GL's depth-driven branch has no WGPU counterpart yet, but its direct depth read and scalar remap are origin-safe. The paired fallback **holds** because GL uses `v_texCoord.y` while WGPU uses `1 - uv.y`. |
| Sharpen | Centre read and equal-weight axial Laplacian **hold** because reflection only exchanges north and south. |
| Sketch | As with Outline, Sobel Y negates and X is preserved; emitting gradient magnitude **holds**. |
| Smaa | No-edge direct branch **holds**; the current approximation's symmetric axial cross for detection and averaging **holds**. |
| Ssao | Direct centre path and equal absolute-difference sum over a symmetric axial cross **hold**. |
| TiltShift | GL's image-Y focus-band comparison versus WGPU's native Y **holds**, including off-centre bands; symmetric vertical blur taps **hold**. |
| ToneMap | Direct source read **holds**; ACES, Reinhard, filmic, Uncharted2, and AgX operator branches are color-only and all **hold**. |
| Vignette | Fixed-centre distance, smooth ramp, and direct source read **hold**. |
| WhiteBalance | Direct source read followed by channel-only temperature/tint math **holds**. |

### What the property audit adds

The full property test did not add a seventeenth failing pair. Beyond ChromaticAberration's radial mode
and LensFlare's halo, it confirms non-equivariant paths in these 14 pairs: Bevel, Convolution, Dither,
DirectionalBlur, DropShadow, FilmGrain, GradientBevel, Halftone, InnerShadow, Kuwahara, LensDirt,
MotionBlur, Pixelate, and RadialBlur. It also confirms that every path in the former compensated,
direct-read, and 16-pair hidden groups has now been tested by the same property rather than inferred from
its syntax.

For MotionBlur, that property result remains a conditional source verdict, not rendered corroboration.
The live capture instrument changed 40,000 pixels under its colour positive control, but the `(0, 0)` to
`(0, 40)` velocity A/B and removal of MotionBlur each changed 0 pixels. The whole effect is inert in the
current scene, so the rendered verdict is blocked pending task 118 even though the sign compensation
remains in source.

Two qualifications changed materially. First, current Kuwahara is not merely tie-sensitive under
reflection: its degenerate sample sets do not permute, so ordinary unique-variance content can diverge.
Repairing the quadrant construction would restore the intended four-set permutation, after which tie
selection would still need an origin-independent rule. The quadrant construction and tie rule remain
separate causes and should be repaired separately. Second, “symmetric Convolution kernel” is sufficient
only for odd-height, vertically palindromic matrices; even-height kernels use an off-centre signed-offset
set and need the stricter degenerate condition stated in the table.

Future verification must use asymmetric probes. Positional and directional parameters are off-centre
and off-axis by default; if a scene must use a neutral value, its comment says which convention error the
scene cannot detect. In particular:

- distinguish Bevel and GradientBevel highlight from shadow under a non-axis-aligned light;
- compare Dither's exact 4x4 phase and keep deterministic FilmGrain/LensDirt seeds;
- use a 45-degree nonzero-distance DropShadow/InnerShadow on an asymmetric source;
- keep the diagonal DirectionalBlur probe, because horizontal and vertical unoriented lines each hide
  the Y-only reflection;
- after task 118 makes MotionBlur visibly active, use a diagonal velocity probe for the same reason;
  until effect removal changes the capture, finer MotionBlur parameter probes are not admissible;
- use angled Halftone, an odd-height asymmetric Convolution kernel, non-dividing Pixelate size, and
  off-centre RadialBlur;
- exercise ChromaticAberration radial mode and LensFlare halo separately from their holding paths. Their
  epsilon-scale defects may disappear in 8-bit captures, so capture equality alone is not a proof; and
- keep off-centre GodRays and TiltShift probes even though their current compensations hold.

The present functional corpus cannot yet execute that whole verification set. `Bevel`,
`GradientBevel`, and `InnerShadow` have no functional cell. `DropShadow` is covered only by
`per-node-effect-glow-shadow` at `angle = 0`, which is blind to a Y-direction error, and the RadialBlur
cell uses the self-reflecting `centerY = 0.5`. These are verification-coverage gaps, not uncertainty in
the source proof above; they must be closed before the atomic migration can claim observable coverage of
those paths.

LensDirt's source-level divergence remains subject to the existing decision that its output difference is
in-contract/acceptable. This record identifies the origin mechanism without reopening which image is
canonical.

## Existing hand compensations

The following source already repairs one positional or directional use locally:

- GL ChromaticAberration: negates epsilon Y in the normalize() guard (`vec2(1e-5, -1e-5)`).
- GL Crt: flips the scanline row.
- GL DirectionalBlur: negates `sin(u_angle)` for the blur direction.
- GL Displacement: converts the procedural phase to image Y and converts the vertical offset back.
- GL Glitch: flips the procedural block index.
- GL GodRays: the recently corrected runner converts the top-left `centerY` contract into GL texture Y.
  The dead `u_resolution` uniform (declared, set, never read) has been removed.
- GL LensFlare: negates epsilon Y in the halo normalize() guard (`vec2(1e-5, -1e-5)`).
- GL MotionBlur: retains the `velocityPixels.y` negation for the smear direction; visible validation is
  blocked pending task 118 because the current scene is byte-identical with the effect removed.
- GL Scanlines: flips the row used for the sine phase.
- GL TiltShift: flips the row before comparing it with the top-left focus centre.
- WGPU ScreenSpaceFog: flips the fallback Y ramp to match the GL horizon placement.

The epsilon-bias entries (ChromaticAberration, LensFlare) are a third compensation mechanism distinct
from position (`1.0 - y`) and direction (negate Y component): they negate the Y of a constant
divide-by-zero guard so the fallback direction at the radial center matches the screen-space direction
the WGPU epsilon produces.

They prove that authors have been solving one shared convention manually. They are correct in the current
mixed-origin system and must not be removed independently. In the structural migration, every transform
whose purpose is backend-origin compensation must be removed or re-expressed as backend-neutral effect
intent in the same atomic change. A formula may still contain `1 - y` for a real concept such as distance
from the bottom; it must no longer contain it merely because one backend supplied a different position UV.

## Review heuristics

1. **A comment justifying a value by saying it matches the other backend is evidence of a missing
   conversion, not evidence of correctness.** Matching the raw numbers across two coordinate spaces
   IS the bug. Source: the Bevel pair, where WGPU's own comment said "matching the GL bevel
   conventions" — copying the numeric values between GL (UV Y-up) and WGPU (UV Y-down) without
   converting is exactly the kind of defect this document catalogues.

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
4. removal/re-expression of all eleven current hand compensations;
5. a renamed GL `CustomShaderEffect` ABI: changing the meaning of `v_texCoord` silently would leave old
   custom shaders compiling but vertically inverted, so the top-left position varying must take a new
   name such as `v_positionUv` and make old shaders fail explicitly until migrated;
6. re-verification of every affected paired, shared, and GL-only module in the same landing.

Sequence this migration **after** the WGPU antialiasing work, not concurrently with it. Both are atomic
changes in the WGPU effect path; overlapping them would make the combined visual diff impossible to
attribute or review.

The verification set must contain asymmetric probes, not only scenes whose symmetry hides the seam,
and those probes must land **with** the migration rather than in a follow-up. Twenty-eight of the 45 pairs
hold on every implemented shader path today, while other current inputs hide parameter-dependent
defects; landing the convention without the probes would therefore leave much of the migration
unobserved:

- a 2x2 labelled-corner texture proves direct sampling remains upright while position UV is top-left;
- off-centre GodRays, TiltShift, and RadialBlur prove public Y parameters;
- seeded FilmGrain and LensDirt plus the exact Dither matrix prove procedural coordinates;
- angled Halftone, Bevel, GradientBevel, DropShadow, and InnerShadow prove signed/rotated directions;
- diagonal DirectionalBlur proves that full-inversion tap symmetry is not mistaken for Y-reflection
  symmetry; after task 118 restores visible MotionBlur output, velocity-driven MotionBlur must prove the
  same property; radial ChromaticAberration and the LensFlare halo prove that zero-length guards do not
  introduce an origin-dependent directional bias;
- an asymmetric Convolution kernel and non-dividing Pixelate size prove latent options;
- the six pre-existing compensated families plus the recently corrected GodRays pair prove that the
  migration did not double-flip them;
- the reflection-equivariant group still runs pair parity so a hidden divergence is not converted into a
  visible regression.

Until that atomic change is approved and verified, the right action is to preserve the local compensations,
keep real holds in place, and avoid adding another effect-specific flip.
