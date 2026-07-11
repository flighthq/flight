---
package: '@flighthq/shading'
crate: flighthq-shading
draft: true
lastDirection: 2026-07-11
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# shading — Charter (reserved home)

## What it is

`@flighthq/shading` is the reserved home for the **Material Feature / Modifier tier** — *compiled* shader augmentations that inject into a material's shading computation and produce shader variants: Fresnel/rim, dissolve, toon quantization, normal perturbation, fog contribution, vertex displacement. These are the "functions from shading values to shading values, compiled into the shader" that recur when a material catalog grows beyond complete per-kind shaders. It is the tier *between* `materials` (complete surface definitions) and `adjustments` (post-output value remaps).

It exists as a **named home now** so the three composition styles each have an unambiguous address (see [effect-adjustment-architecture](../../effect-adjustment-architecture.md)):

- **Material** — a complete shading input, fed to lighting.
- **shading / Modifier** — a *compiled* feature injected into the material shader (variant-producing, batches by feature-set). **← this package.**
- **Adjustment** — a *data-fed* pointwise value remap folded into the draw (fuses, batch-safe).
- **Effect** — an offscreen pass.

## The line that keeps it distinct

A Modifier is **compiled shader code** (a snippet composed into the material program, producing a variant). An Adjustment is **data** (a matrix/LUT feeding a fixed stage). They look similar — both fold into the draw, neither bounces — but they compose differently and cost differently: adjustments fuse to one data artifact and never split a batch; features inject code and batch by feature-set. Three independent reviewers defaulted to modeling a color transform as a compiled feature; it is not one. Nothing that reduces to a matrix or LUT belongs here — it belongs in `adjustments`. This package is for augmentations that genuinely require *code* in the shader.

## Build posture — reserved, not yet built

Flight ships **complete materials** today (`StandardPbr`, `Toon`, `Matcap`, … are whole shaders, not composed from features), so there is no compiled-feature system and no consumer for one. Per the plurality guard and "don't build the dispatcher before its consumer" (forks B/E in [structural-forks](../structural-forks.md)), the compiler/shader-graph is **deliberately not built now** — building an uber-shader/variant system with zero consumers is exactly the over-decomposition the register warns against.

**When it gets built:** the first time a material augmentation is genuinely wanted as a *composable feature* rather than a whole new material kind (e.g. "dissolve on any material," "rim light on any material") — i.e. when plurality appears (≥2 real features that must combine on one material). At that point this package gains its bedrock: a `Modifier` descriptor, a composition contract (how features order and combine), and the per-backend compiler that assembles base material + features into one program. Until then the charter holds the address and the boundary; the register tracks it as reserved.

## Boundaries (for when it is built)

- **Compiled features, not data.** If it reduces to a color matrix or a LUT, it is an `adjustments` op, not a shading feature.
- **Injects into the material shader** (produces variants), distinct from `effects` (offscreen passes) and `adjustments` (fixed-stage data fold).
- **Composition is code-space** — this is the one tier that owns the variant/shader-graph machinery the other tiers deliberately avoid. Keep that cost contained here.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-11] Chartered as the reserved home for the compiled Material Feature / Modifier tier; not built yet.** Blessed as part of [effect-adjustment-architecture](../../effect-adjustment-architecture.md). The name/address exists so the three composition styles are each well-homed; implementation waits for a real composable-feature consumer (plurality guard).

## Open directions

1. **First feature that justifies building it** — a dissolve or rim-light wanted across materials, forcing the base+features compile path.
2. **Rust candidacy** — a shader-graph compiler may be a `rust:` backend candidate once its shape is known.
3. **Relationship to `materials`** — whether features live here and compile *with* `materials`, or `materials` grows a feature slot; decide when built.
