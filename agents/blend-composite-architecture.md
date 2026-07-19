# Blend / Composite Architecture

How color-mixing and coverage-combining are modeled across the four backends. Read before touching
`BlendMode`, the advanced-blend `BlendEffect`, or adding a compositing operator. Sibling of
[effect-adjustment-architecture](effect-adjustment-architecture.md) — that doc splits image *operations*
into material/adjustment/effect; this one splits *pixel combination* into blend vs composite.

## The one invariant

Everything sorts by a single line — **not** the W3C blend-vs-composite taxonomy, but **cost**:

> **Operations that combine against the live framebuffer in fixed-function hardware are cheap per-node
> properties. Operations that require an isolated layer (a group rendered to its own alpha target) are
> explicit effects.**

The GPU blend unit reads the destination framebuffer *in place* — no fixed-function blend or composite
allocates a target. An offscreen appears for exactly two reasons, both intrinsic to the operation (a
GPU-only renderer would pay them too, so this is **not** a parity tax):

1. **Isolation / containment** — to scope an operation to a group (so `Erase` cuts only the group, not the
   whole scene) the group renders to its own target, then merges back. Semantic; optional when you don't
   need containment.
2. **Backdrop sampling** — an advanced blend runs in a shader that must *read* the backdrop as a texture,
   and you can't sample the framebuffer you're writing to. Mechanical — but skippable on hardware with
   `KHR_blend_equation_advanced` / `EXT_shader_framebuffer_fetch`, which the open blend registry lets a
   backend exploit for an in-place fast path.

## Tier 1 — `node.blend`: the cheap fixed-function property

A unified, backend-consistent blend enum. Every member is a premultiplied fixed-function blend state —
one draw, no offscreen, ever:

`{ Normal, Multiply, Screen, Darken, Lighten, Add }`

- **Premultiply is what makes the ADD-family edge-correct as fixed-function.** The "restore the backdrop
  where the source is uncovered" term becomes a single dst factor (`ONE_MINUS_SRC_ALPHA` /
  `ONE_MINUS_SRC_COLOR`), and the source factor drops to `ONE`. Straight alpha would fringe or need a
  shader. So `Normal/Add/Multiply/Screen` are exact everywhere.
- **`Darken`/`Lighten` are the one caveat and live in *both* tiers.** Their GL realization is the `MIN`/`MAX`
  blend equation, which cannot carry the coverage-restore term — so on GL they are **exact only for opaque**
  content and fringe at transparent edges. Canvas/DOM render them exactly (browser compositor). For GL
  edge-correctness with transparency, realize them as a `BlendEffect` (un-premultiply → min/max → composite
  over). Cheap property by default; effect when you need the transparent-edge fidelity.
- **`Add` is taxonomically a compositing operator (`plus`) but lives here** because it is a cheap
  fixed-function state (`{ONE, ONE}`), shares its realization with `Multiply`, and *must not* be an effect
  (additive particles would each need a layer). Cost taxonomy wins over W3C taxonomy.

## Tier 2 — effects: anything needing an isolated layer

Two effect families, both substrate-agnostic descriptors realized by per-backend runners over the effect
pipeline (see [effect-adjustment-architecture](effect-adjustment-architecture.md)):

- **`BlendEffect`** (`@flighthq/types`, `createBlendEffect`) — the destination-reading / non-separable
  `AdvancedBlendMode` set (Overlay/HardLight/SoftLight/Difference/Exclusion/ColorDodge/ColorBurn + the HSL
  modes Hue/Saturation/Color/Luminosity). A shader samples layer + backdrop and runs `blendModeMath`.
- **`CompositeEffect`** (`@flighthq/types`, `createCompositeEffect`) — the Porter-Duff `CompositeOperator`
  set (SourceOver/DestinationOver/Source·Destination-In/Out/Atop/Xor/Copy/Clear). **Erase = DestinationOut,
  Alpha = DestinationIn.** A *fixed-function* coverage combine `Fa*layer + Fb*backdrop` on premultiplied
  color — the cheap sibling of `BlendEffect` (no shader math, just the factor pair). Ground truth is
  `@flighthq/effects` `compositeOperatorMath` (`getCompositeOperatorFactors`); the GL/Canvas realizations
  mirror it and are verified against those plain numbers.

Both reference a per-state registered backdrop by `backdropKey` (a live GPU texture can't live in
serializable data). `CompositeEffect` reuses the `registerGlBlendEffectBackdrop` registry.

## The enum re-filings

The legacy single `BlendMode` enum conflated blend, composite, isolation, and non-modes. Applying the
invariant sorts them:

| Legacy `BlendMode` | Disposition |
| --- | --- |
| Normal, Multiply, Screen, Darken, Lighten | stay in `node.blend` |
| Add | stays in `node.blend` (cheap fixed-function state, though W3C-composite) |
| Erase, Alpha | → `CompositeEffect` (`DestinationOut` / `DestinationIn`) |
| None | → `CompositeOperator.Copy` (overwrite) |
| Layer | → isolation directive (render the container as a group), not a blend |
| Invert | → backdrop-reading effect (`B(cb,cs) = 1 − cb`); distinct from an invert *adjustment* (pointwise on the node's own color) |
| Shader | → removed; it is a material/shader marker, never a blend equation |
| Subtract | → **unnamed**. Not a W3C blend function — a GL blend *equation* affordance. Users wire it via the open `registerGlBlendMode` seam (vendor-prefixed, e.g. `acme.subtract` with `equation: 'FUNC_REVERSE_SUBTRACT'`). No blessed name, because "Subtract" is overloaded (Photoshop blend ≠ GL reverse-subtract ≠ composite). |

Custom operators/equations on either tier use the open registries (`registerGlBlendMode`,
`registerGlCompositeOperator`) with a vendor prefix — the YOLO / extension escape hatch.

## Per-backend reality

`node.blend` fixed-function set is consistent except honest, substrate-permanent holes:

- **Canvas / GL / wgpu**: full set. GL `Darken`/`Lighten` opaque-only (above).
- **DOM**: `Add` maps to `mix-blend-mode: plus-lighter` when `CSS.supports('mix-blend-mode','plus-lighter')`
  (baseline across engines ~late 2024; Firefox was the holdout at 130), else falls back to `screen`
  (approximate). CSS exposes only the *blend* axis, so additive (`plus`) is otherwise absent.

Composite operators: **Canvas** has the full Porter-Duff set natively (`globalCompositeOperation`);
**GL/wgpu** express all of them via `blendFunc` factor pairs (require an alpha target — the isolation
layer); **DOM** has essentially only SourceOver + Plus. So a `CompositeEffect` on DOM has **no automatic
runner** — it can be realized by rendering the isolated subtree through the Canvas renderer into an
embedded `<canvas>`, but only for canvas-rasterizable content (loses accessibility/interactivity), so it is
an explicit opt-in, never automatic. (A CSS Masking `mask-composite` path may cover the Erase/Alpha subset
natively — to investigate.)

## Cost legibility

The API telegraphs the cost *class*, not the milliseconds:

- `node.blend` property → no offscreen. Cheapest.
- `CompositeEffect` → isolation layer + one fixed-function draw. Cheapest effect.
- `BlendEffect` → isolation layer + shader sampling two textures.
- Multi-pass effects (blur/bloom) → isolation layer + N passes.

Every offscreen is an explicit, countable engine allocation (an effect in the node's list), never a hidden
GPU side effect of picking a mode. `RenderEffect` input tags (`[HDR]`/`[DEPTH]`/…) declare an effect's
target/pass requirements statically. Absolute cost still needs profiling — and that is fine: the guarantee
is "no operation hides its cost *class*," not "the API predicts nanoseconds."

## Don't tax the GPU (non-goals)

1. Never route a fixed-function blend through a layer for uniformity — `Multiply`/`Add` stay in-place.
2. Don't force isolation when the target is already the boundary — expose a cheap in-place composite where
   the raw operator is correct; reserve the offscreen for requested containment.
3. Let GL register in-place realizations of advanced blends on `KHR_blend_equation_advanced` /
   framebuffer-fetch hardware — the offscreen is the portability floor, not the ceiling.

## Implementation status

- **Built**: `CompositeOperator` + `CompositeEffect` types; `compositeOperatorMath`; `createCompositeEffect`;
  the GL runner (`glCompositeEffect`, premultiplied Porter-Duff pass) registered in the effects-gl composite
  band. Additive — the legacy `BlendMode` enum is untouched.
- **Pending**: Canvas `CompositeEffect` runner (`globalCompositeOperation` 1:1) and wgpu runner; the
  `BlendMode` enum cleanup (the re-filings above) across `render-gl`/`render-wgpu`/`displayobject-canvas`/
  `displayobject-dom` + serialization + tests; DOM `Add` → `plus-lighter` capability gate; `Invert` as a
  `BlendEffect` mode. The enum cleanup is a breaking cross-package reshape — run `npm run ci`.
