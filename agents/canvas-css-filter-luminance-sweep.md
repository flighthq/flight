# Canvas CSS-filter / luminance sweep

Status: all nine Canvas effect kinds that supply a non-`none` `ctx.filter` expression reconciled against
their GL and WGPU siblings; one structural divergence reproduced; no implementation in this change.

## Predicate and result

The predicate is:

> A Canvas effect supplies a non-`none` CSS filter expression to `drawCanvasEffectPass`, and a same-kind
> GL or WGPU sibling makes a color decision from one luminance/brightness scalar. If the Canvas filter
> instead makes that decision per channel, a mixed-color pixel can put one channel on the other side of
> the decision boundary while its aggregate luminance remains on the first side.

The first clause produces **nine candidate effect kinds**. Reset-only `ctx.filter = 'none'` assignments,
the pipeline identity copy, and comments are not candidates. Following every `drawCanvasEffectPass`
caller and both computed `drop-shadow(...)` strings yields the exact filter population:

- `BevelEffect` — `blur(...)`;
- `BloomEffect` — `contrast(...) brightness(...)`, then optional `blur(...)`;
- `BlurEffect` — `blur(...)`;
- `DropShadowEffect` — `drop-shadow(...)` on the fast path, `blur(...)` on the composited path;
- `GradientBevelEffect` — `blur(...)`;
- `GradientGlowEffect` — `blur(...)`;
- `InnerGlowEffect` — `blur(...)`;
- `InnerShadowEffect` — `blur(...)`; and
- `OuterGlowEffect` — `drop-shadow(...)` on the fast path, `blur(...)` on the composited path.

All nine have both GL and WGPU siblings. A targeted search of those 18 sibling files finds luminance
math in exactly one pair: Bloom's GL and WGPU bright passes both compute
`dot(c.rgb, (0.2126, 0.7152, 0.0722))` and threshold that scalar. The other eight siblings either blur a
four-channel sample component-wise or derive an effect field from source alpha.

Reconciled total:

- **1 confirmed divergent** — Bloom;
- **8 agree anyway under this predicate** — Blur, Bevel, DropShadow, GradientBevel, GradientGlow,
  InnerGlow, InnerShadow, and OuterGlow; and
- **0 no sibling**.

“Agree anyway” is deliberately scoped to the per-channel-versus-luminance mechanism. It is not a claim
of full pixel parity: axis collapsing, directional offsets, blur kernels, and Canvas compositing can
still differ for reasons outside this predicate.

## Discriminating measurement

The eight equality probes used the actual package Canvas functions in headless Chromium. Their two
13x13 square subjects had identical alpha and RGB `[80, 255, 255]` versus `[255, 80, 255]`; the color
swap changes luminance substantially while holding geometry and alpha fixed. Effect-only comparisons
used `sourceMode: 'hide'`. The two CSS `drop-shadow(...)` fast paths instead compared only pixels outside
the source square, so the intentionally different source fill could not count as an effect difference.

Every equality probe also counted nontransparent output. This prevents an unrendered or blank effect
from passing by equality: Bevel produced 711 nontransparent pixels, DropShadow 757, GradientBevel 169,
GradientGlow 757, InnerGlow 169, InnerShadow 169, and OuterGlow 757. GradientBevel used an inner clip and
a transparent/opaque/transparent ramp; its output contains 14 distinct nonzero alpha values, so the
169-pixel result is a live varying band rather than a saturated fill. The source covers 169 pixels, so
the 757-pixel shadow/glow outputs necessarily include a live exterior branch.

Bloom used a separate one-pixel probe with `threshold = 0.8`, `radius = 0`, and `intensity = 0.5`. The
Canvas side ran the production `contrast(5.8) brightness(0.2)` chain and `lighter` composite. The GL side
ran the sibling's bright-threshold and additive-composite equations in a real WebGL2 fragment pass.
The blur is intentionally zero so no spatial resampling can hide which bright-pass decision was made.

| subject | weighted luminance | Canvas bright branch | Canvas composite | WebGL composite | verdict |
| --- | ---: | --- | --- | --- | --- |
| `[255,255,255]` | 1.000 | `[51,51,51]` | `[255,255,255]` | `[255,255,255]` | saturated control agrees |
| `[80,255,255]` | 0.854 | `[0,51,51]` | `[80,255,255]` | `[120,255,255]` | **diverges by 40 red levels** |
| `[80,80,80]` | 0.314 | `[0,0,0]` | `[80,80,80]` | `[80,80,80]` | below-threshold control agrees |

The mixed subject is the discriminating case. Its aggregate luminance is above `0.8`, so GL and WGPU
keep all three channels in the bright branch. Canvas contrast crushes red independently while cyan
survives. The final red-channel difference is therefore predicted from the decision seam and reproduced
by the browser; it is not inferred from similar-looking source alone.

## Per-candidate reconciliation

| Canvas effect | Canvas filter decision | GL/WGPU sibling decision | measurement | classification |
| --- | --- | --- | --- | --- |
| Bloom | `contrast` clamps each channel independently, then `brightness` scales each surviving channel | one weighted-luminance threshold gates the complete RGB sample | mixed cyan-red subject above: Canvas `[80,255,255]`, GL `[120,255,255]`; both controls agree | **confirmed divergent** |
| Blur | CSS Gaussian blur has no color threshold | separable Gaussian accumulates and normalizes `vec4`/`vec4f` samples component-wise | constant mixed-color field `[80,255,255]` remains `[80,255,255]` at the blurred centre | **agrees anyway** |
| Bevel | CSS blur is an intermediate; offset differencing, clipping, and tinting consume its alpha | neutral tint creates a source-alpha field; box blur and directional composite read alpha | same-alpha RGB swap changes 0 bytes in 711 nontransparent effect-only pixels | **agrees anyway** |
| DropShadow | `drop-shadow` derives its shadow from source alpha; fallback tints the alpha mask before CSS blur | tint pass derives a source-alpha mask, then box blur | fast-path same-alpha RGB swap changes 0 exterior bytes; 757 nontransparent pixels versus a 169-pixel source | **agrees anyway** |
| GradientBevel | CSS blur feeds offset alpha differences; a ramp is indexed by encoded band strength | box-blurred alpha feeds the bevel scalar and ramp lookup | same-alpha RGB swap changes 0 bytes in a 169-pixel inner band with 14 distinct nonzero alpha values | **agrees anyway** |
| GradientGlow | CSS blur feeds an alpha-indexed gradient ramp | box-blurred source alpha indexes the ramp | same-alpha RGB swap changes 0 bytes in 757 nontransparent effect-only pixels | **agrees anyway** |
| InnerGlow | an inverted tinted alpha mask is blurred, clipped to source alpha, and composited | inverse-tint alpha field, box blur, then source-alpha clip | same-alpha RGB swap changes 0 bytes in 169 nontransparent effect-only pixels | **agrees anyway** |
| InnerShadow | an inverted tinted alpha mask is blurred, offset, and clipped to source alpha | inverse-tint alpha field, box blur, offset, then source-alpha clip | same-alpha RGB swap changes 0 bytes in 169 nontransparent effect-only pixels | **agrees anyway** |
| OuterGlow | `drop-shadow` derives its glow from source alpha; fallback tints the alpha mask before CSS blur | tint pass derives a source-alpha mask, then box blur | fast-path same-alpha RGB swap changes 0 exterior bytes; 757 nontransparent pixels versus a 169-pixel source | **agrees anyway** |

## Consequence

The generalization predicts one current failure, not a family of nine: **CSS filters are risky here only
when their color decision is per-channel while a sibling's corresponding decision is luminance-based.**
Plain blur and `drop-shadow` do not introduce such a decision boundary, and the six composite recipes use
CSS blur only after reducing the meaningful signal to alpha.

Bloom should move its Canvas bright pass to `drawCanvasImageDataPass` (or another explicit pixel pass)
that computes the same weighted luminance threshold as GL/WGPU. Replacing only the later blur would not
repair the mechanism: the information loss has already happened in `contrast(...) brightness(...)`.
