---
package: '@flighthq/adjustments'
crate: flighthq-adjustments
draft: false
lastDirection: 2026-07-11
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# adjustments — Charter

## What it is

`@flighthq/adjustments` is the **pointwise value-remap tier** — the substrate-agnostic catalog of image operations that map one pixel to one pixel (no neighbors) and therefore **fold into the draw as data** rather than bouncing through an offscreen pass. Plain-data descriptors (one `create*Adjustment` per kind) plus the **fuse math** every backend shares: a stack of adjustments collapses to **one** 4×5 color matrix (linear ops) or **one** baked 3D LUT (arbitrary value→value). Sole runtime dependency is `@flighthq/types`.

It is the sibling of `@flighthq/effects` across the one line that matters: adjustments **fuse-and-fold** (data, batch-safe, no offscreen), effects **chain-and-bounce** (passes, offscreen targets). See [effect-adjustment-architecture](../../effect-adjustment-architecture.md) for the full model; this charter is the package's own scope.

**Data-fed, not compiled.** An adjustment is a *fixed* shader stage (`color = color * mult + offset`, or a LUT tap) driven by a per-instance attribute or a uniform — **never an injected shader snippet**. That is the whole reason it fuses and stays batch-safe. Compiled shader features (Fresnel, dissolve, toon-as-feature, vertex displacement) are a different, reserved tier ([`@flighthq/shading`](../shading/charter.md)); do not fold them in here.

## North star

`create*Adjustment` descriptors for the pointwise catalog — `ColorTransform`, `Brightness`, `Contrast`, `Saturation`, `HueRotate`, `Invert`, `Grayscale`, `ChannelMixer`, `ColorBalance`, `Exposure`, `LiftGammaGain`, `LookupTableGrade`, `ColorBlindSimulation` — each declaring whether it reduces to the **matrix** tier (linear) or the **LUT** tier (arbitrary value→value). The fuse primitives: `concatColorMatrix`/compose (moved from `filters/colorMatrixMath`) and a LUT baker that composes a stack of value→value functions into one cached 3D LUT. A user adds their own adjustment by contributing a matrix or a `rgb→rgb` function — **data that composes**, no GLSL, no variant.

Realization is per-backend and lives where the shape dictates: the **GPU inline contribution** (folding into the batch draw via `a_ctMult`/`u_ctMult`) lives in the draw packages (`displayobject-gl` and the sprite batch path), not a symmetric `adjustments-gl` pass package; `adjustments-surface` (CPU pixel pass) and `adjustments-css` (property emitter) are standalone backends. Presence of a `(kind, backend)` realization **is** the support matrix; a missing one returns the sentinel and `explainEffectRealization` explains it.

## Boundaries

- **Pointwise only.** One pixel → one pixel. Anything reading neighbors or needing multiple passes/buffers is an **Effect**, not an adjustment. Anything defining the surface fed to lighting is a **Material**.
- **Fuse, don't chain.** A stack of adjustments must collapse to one matrix or one LUT before realization — that is the invariant that keeps it a single fold-in, never N passes.
- **No container/wrapper types.** A stack is a plain `readonly Adjustment[]`; the plural is a function name, not an invented `AdjustmentList`/`FilterList` noun. Do not introduce wrapper hierarchies.
- **Deps: `@flighthq/types` only.** No DOM, no GPU, no renderer — realization lives in the backend packages / draw path.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-11] `filters` dissolves into `adjustments` + `effects`.** The pointwise tier (color-matrix and friends) lands here; spatial/composite ops go to `effects`; the `filters*` packages retire. Blessed as fork H / [effect-adjustment-architecture](../../effect-adjustment-architecture.md).
- **[2026-07-11] Adjustments are data-fed and fuse to one matrix/LUT.** Composition happens in data (matrix multiply, LUT bake) against a fixed shader stage — never by injecting/collating shader snippets. The escape hatch for non-pointwise custom shading is `customShaderEffect` (an Effect), not this package.
- **[2026-07-11] Uniform vs per-instance is chosen by data cardinality.** One value on the node → uniform binding; per-instance values → the promoted `a_ctMult` attribute stream. Attaching an adjustment promotes a batch at most, never splits it.

## Open directions

1. **LUT granularity.** Resolution/precision (banding), and per-instance LUT variation (texture-array + index) vs per-batch shared LUT — decide the default and the promotion path.
2. **Inline stage generality.** Whether the batch's fixed inline stage carries a full 4×5 color matrix (hue/saturation channel-mixing composes inline) or affine mult+offset only (channel-mixers fall to a LUT). Sets exactly which stacks are free vs baked.
3. **`render-backend-support` generation.** Emit the backend support matrix from `(kind, backend)` realization presence, replacing the hand-maintained prose.
