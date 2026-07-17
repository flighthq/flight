---
package: '@flighthq/shading'
crate: flighthq-shading
draft: false
lastDirection: 2026-07-17
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# shading — Charter

## What it is

`@flighthq/shading` is the home for the **Material Feature / Modifier tier** — *compiled* shader
augmentations that inject into a material's shading computation and produce shader variants:
Fresnel/rim, dissolve, toon quantization, normal perturbation, emissive contribution, fog, vertex
displacement. These are the "functions from shading values to shading values, compiled into the
shader" that recur once a material catalog grows beyond complete per-kind shaders. It is the tier
*between* `materials` (complete surface definitions) and `adjustments` (post-output value remaps).

Pipeline order (see [effect-adjustment-architecture](../../effect-adjustment-architecture.md)):
**Material** (base shading) → **[Modifiers, compiled — this package]** → shaded output →
**Adjustment** (data-fed remap) → **Effect** (offscreen pass).

- **Material** — a complete shading input, fed to lighting.
- **shading / Modifier** — a *compiled* feature injected into the material shader (variant-producing, batches by feature-set). **← this package.**
- **Adjustment** — a *data-fed* pointwise value remap folded into the draw (fuses, batch-safe).
- **Effect** — an offscreen pass.

## The line that keeps it distinct

A Modifier is **compiled shader code** (a snippet composed into the material program, producing a
variant). An Adjustment is **data** (a matrix/LUT feeding a fixed stage). They look similar — both
fold into the draw, neither bounces — but they compose differently and cost differently: adjustments
fuse to one data artifact and never split a batch; modifiers inject code and batch by feature-set.
Three independent reviewers defaulted to modeling a color transform as a compiled feature; it is not
one. Nothing that reduces to a matrix or LUT belongs here — it belongs in `adjustments`. This
package is for augmentations that genuinely require *code* in the shader.

## Build posture — v1 triggered (2026-07-17)

The reserved charter set one build trigger: *the first time ≥2 real features must combine on one
material.* That trigger is now met. The AwayJS globe (`intermediate-globe`, [sdk-blocking-issues](../../sdk-blocking-issues.md) #4)
needs **three** features stacked on one surface — a night-side emissive gated by facing, an
atmospheric Fresnel rim, and an animated ocean normal. Modeling that as one bespoke "globe material"
would mirror an AwayJS class 1:1 (an anti-goal) and bury three reusable features in a lump. The
features are independently reusable — emissive-by-facing (lit windows, decals, light-maps), rim
(atmosphere, shields, NPR rim), animated normal (water, lava, flow) — so the composable tier is the
correct home, and the globe becomes a **composition** of built-in modifiers rather than a material.

### v1 scope

1. **A composable base lit material owned here** (working name `ShadedMaterial`) that carries an
   ordered **Modifier stack**. This is the predictable primary surface: one base to reason about, one
   compile context, a contained blast radius. It is a **third assembly over the shared light block,
   not a third light loop** — it reuses `GL_MESH_LIGHT_BLOCK_GLSL` / `glLitProgram` exactly as the
   PBR and classic assemblies already do (`packSceneLightBlock` on the CPU side), so no lighting is
   duplicated and cross-assembly parity holds.
2. **A `Modifier` descriptor + an open registry keyed by feature kind**, with a **slot taxonomy**
   naming *where* a modifier contributes — `diffuse / specular / normal / emissive / effect`
   (ambient/shadow reserved). Registry-by-default: users add vendor-prefixed modifier kinds; unused
   modifiers tree-shake out; an assembly never costs more than its parts.
3. **A composition/ordering contract** — how a modifier stack orders and combines, keyed to slots,
   so a scene round-trips and the compiled variant is deterministic per feature-set.
4. **A per-backend compile path** that assembles `base + ordered modifiers` into one program and
   caches by feature-set define-key (the machinery the other tiers deliberately avoid — kept
   contained here).
5. **A per-frame uniform seam** (starting with `time`) owned by this tier — the plumbing gap #4
   exposed. The bind-once-per-material model has no per-frame channel; animated modifiers (scrolling
   normal) need one, and it belongs here rather than being retrofitted into `materials`.
6. **Three seed modifiers, generalized (not AwayJS-named)** — proving the taxonomy across three
   slots:
   - **Emissive modifier** (slot: emissive) with an optional facing/mask input → covers night-side.
   - **Rim / Fresnel modifier** (slot: effect) → view-dependent additive; covers the atmosphere halo.
   - **Animated normal modifier** (slot: normal) → UV-panned, optional dual-layer; covers water.

### v1 accepted cost (blessed)

Modifiers attach only to this tier's composable base material in v1. **They do not stack on the
`materials` PBR/classic kinds** (StandardPbr and its clearcoat/sheen/subsurface/transmission variants,
or the classic Blinn-Phong/Phong/Lambert). Getting "full PBR BRDF + a custom modifier" would mean
re-authoring as a `ShadedMaterial` and forgoing those variant features. This is accepted for v1: the
globe/stylized/effect cases don't need it, and injecting modifier GLSL into two hand-authored
uber-shaders across the PBR define-matrix is the *less* predictable design (a modifier snippet would
have to be correct against multiple base contexts). The modifier↔base boundary is therefore defined
as a **contract over the slot taxonomy + the shared light block**, so exposing the same injection
hooks on the `materials` kinds later is an additive open door, not a rewrite.

## Boundaries

- **Compiled features, not data.** If it reduces to a color matrix or a LUT, it is an `adjustments`
  op, not a shading modifier.
- **Injects into the material shader** (produces variants), distinct from `effects` (offscreen
  passes) and `adjustments` (fixed-stage data fold).
- **Owns its own composable base material**, distinct from `materials`' complete per-kind shaders.
  Reuse the shared light block; never fork a second light loop.
- **Composition is code-space** — this is the one tier that owns the variant/shader-graph machinery
  the other tiers avoid. Keep that cost contained here; it must tree-shake to nothing for anyone who
  doesn't import a modifier.
- **No domain materials.** `WaterMaterial` / `GlobeMaterial` are presets/compositions, not modifiers
  — they live in examples or a later `-presets` neighbor, not here.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-11] Chartered as the reserved home for the compiled Material Feature / Modifier tier; not built yet.** Blessed as part of [effect-adjustment-architecture](../../effect-adjustment-architecture.md). The name/address exists so the three composition styles are each well-homed; implementation waits for a real composable-feature consumer (plurality guard).
- **[2026-07-17] Build trigger met — v1 chartered.** The globe (#4) stacks three features on one surface; plurality is real. v1 delivers the Modifier descriptor + open registry, the slot taxonomy (diffuse/specular/normal/emissive/effect), a composition/ordering contract, the per-backend compile path, a per-frame (`time`) uniform seam, and three seed modifiers (emissive-with-mask, rim/Fresnel, animated normal).
- **[2026-07-17] shading owns its own composable base material (`ShadedMaterial`), a third assembly over the shared light block — NOT injection into `materials`' PBR/classic kinds (v1).** Resolves the reserved charter's Open direction #3. Reuse `GL_MESH_LIGHT_BLOCK_GLSL`; no second light loop. Accepted cost: modifiers do not stack on PBR-variant/classic materials in v1. The modifier↔base boundary is a contract over slots + the shared light block, leaving "expose hooks on `materials` kinds" open as an additive future step.

## Open directions

1. **Backend scope for v1 — recommend gl-first.** The globe and the affected examples are WebGL; wgpu
   has documented gaps ([render-backend-support](../../render-backend-support.md)). Recommend
   `scene-gl` first with the compile path designed backend-agnostically, `scene-wgpu` as a fast-follow
   at parity. Pin before dispatch.
2. **Naming** — confirm `ShadedMaterial` for the composable base and `Modifier` (vs "feature"/"method")
   for the injected unit; settle the modifier-kind string convention and the slot names.
3. **Exposing modifier hooks on `materials` kinds** — the deferred "PBR + modifiers" path; additive,
   revisit once v1 lands and a real case wants a modifier on a full-PBR surface.
4. **Rust candidacy** — the base+modifiers compiler / shader-graph assembler is a plausible `rust:`
   backend candidate once its shape is known.
5. **Ambient/shadow slots** — reserved in the taxonomy; add when a real modifier needs them.
