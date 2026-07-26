# Material Modifier Model — tinting, adjustments, and shading as one axis

**Status: IMPLEMENTED** — commits `71875e9e0`…`842689fa2`, on top of the BitmapText-leaf reshape
(`c88bf5ca2`…`3c4ad62aa`). This note records the design arc and the shipped result: 2D adjustments and
3D per-object color unified under one material-feature model. It refines
[effect-adjustment-architecture](effect-adjustment-architecture.md); read that first for the
Material / Adjustment / Effect tiers.

What shipped:

- **`BitmapText` is a first-class leaf** — owns its per-page glyph quads, draws through its own
  per-backend renderer (`gl`/`canvas`/`wgpu`), the Tilemap pattern. No child `QuadBatch` nodes, no `color` field.
- **Tint is a dimension-agnostic node capability** — `setNodeColorAdjustmentsTint(node, rgba)` on base
  `Node` (full API below). Golden path; round-trips as scene data.
- **Color adjustment is a registered material feature**, not a per-backend fold —
  `glColorAdjustmentMaterialFeature` / `wgpuColorAdjustmentMaterialFeature` carry one shader chunk to the
  Standard-2D and promoted 3D-family compilers. Variant-by-presence (`CT_MODE_NONE` lean base shader /
  whole-batch uniform / per-instance `a_colorScale`+`a_colorBias`), chosen by data cardinality, **never
  splits the batch**, tree-shakes when unregistered. `glStandardMaterial` is the promoted `DefaultMaterial`.

## Shipped API & naming (final, decided)

- **Authoring is dimension-agnostic on base `Node`** (the `colorAdjustments` slot always lived there):
  `getNodeColorAdjustments` / `setNodeColorAdjustments(…|null)` / `addNodeColorAdjustment` /
  `setNodeColorAdjustmentsTint`. **Plural = whole-stack** (get/set/clear/tint-clobber), **singular =
  single-item** (add) — so the plural in `…ColorAdjustmentsTint` is the clobber signal. No `setNode2D…`
  or `setNode3D…` twins.
- **The 8-value affine type is `ColorScaleBias`** — flat `redScale…alphaScale` + `redBias…alphaBias`,
  `out = in*scale + bias` per channel (no mixing). Operational name chosen over `ColorAffine` (which
  names a category, not an action, and mis-signals generality) and over Flash's `ColorTransform` (five
  overloaded meanings). **Bias is unbounded normalized-linear** (not 0–255); the old `/255` at the shader
  bind is gone, byte-domain consumers convert at their own boundary.
- **Representation hierarchy:** `ColorScaleBias` (per-channel scale+bias) ⊂ `ColorMatrix` (channel mixing)
  ⊂ `ColorLut`/`ColorTransformFunction` (arbitrary). "Resolved" lives in **slot names**
  (`resolvedColorScaleBias` fast path; `resolvedColorMatrix` when a stack mixes channels — the full 4×5
  path is realized, not deferred), never a separate `ResolvedColorAdjustment` type.
- **Tint is golden; `ColorScaleBias` is the Flight-native bridge, not co-equal vocabulary.** Golden:
  `setNodeColorAdjustmentsTint(rgba)`. Semantic ops (brightness/saturation/…) via
  `addNodeColorAdjustment(node, create…)`. Escape hatch: `createColorMatrixAdjustment(matrix)`. Bridge:
  `createColorScaleBiasAdjustment(scaleBias)` — a per-channel constructor with no Flash in it.
- **No compat aliases, no Flash/OpenFL in core docs.** A pre-release, from-scratch SDK does not keep a
  `@deprecated` alias for a name it never shipped (that reintroduces the overload the rename removed and
  keeps callers in the old mental model), and core primitive/API docs describe Flight's own model without
  naming the frameworks it deliberately doesn't mirror. Porting hints, if ever wanted, live in a separate
  porting guide — never welded into a primitive's doc comment. (Discoverability comes from the
  self-descriptive names, not from an alias.)

## The principle: one modifier axis, 2D and 3D

A material is a **base shading + a stack of composable modifiers that resolve into one draw**.
`ShadedMaterial` already models this on the 3D side (base + fresnel/normalPerturb/emissive/… spliced
into one compiled program). The proposal extends the same model to 2D and folds adjustments into it:

> Shading is the **family axis** (Standard / Phong / PBR / Shaded). Adjustment (color remap) is a
> **feature orthogonal to that axis**, carried by any family. 2D is just the family that expects it
> most often; it is never mandatory.

"2D has adjustments, 3D has material modifiers" was an artifact of never having a unified modifier
model. There is one model; adjustments are one kind of modifier in it.

## The composition trichotomy: fuse / splice / bounce

Three mechanisms compose a per-shade operation into a frame. Each is a natural kind — *what* the op
does correlates with *how* it must realize:

- **fuse (data)** — pointwise color remaps (`@flighthq/adjustments`: color matrix / LUT). A stack
  concatenates into **one matrix** (`concatColorMatrix`) and binds as **one uniform**. No recompile,
  no permutation, batch-safe. This closed-form fold is *why* color remaps are their own thing —
  pointwise affine color is closed under composition; lighting/geometry is not.
- **splice (code)** — lighting/geometry modifiers (`@flighthq/shading`: fresnel, normalPerturb,
  vertexDisplace…). Spliced into **one compiled program** via the state-scoped compiler registries.
  One draw, but each combination is a shader permutation.
- **bounce (pass)** — spatial/composite ops (`@flighthq/effects`: blur, bloom, drop-shadow). Chain as
  **offscreen passes**.

Adjustments are **the fusable subset of material modifiers** — not a separate tier from shading
modifiers, but the members that admit a data fold instead of a code splice. `getAdjustmentColorMatrix`
already *is* that boundary ("carries a fusable 4×5 `colorMatrix`", kind-agnostic).

## Feature, not family — separate the definition, unify the batch identity

Do **not** mint a distinct `ColorAdjustmentMaterial` family you switch to. In 2D, depth is semantic
(painter's order, transparency) — you cannot reorder to group tinted sprites — so a distinct tinted
material would split z-interleaved batches. Scattered tint (damage flash, selection, team color at
arbitrary depths) is the common case and fragments worst. Preserving co-batching is exactly why tint
was pulled out of materials into a per-node capability in the first place: a tinted and an untinted node
with the same texture and blend must still batch together.

Split on the axis where it helps, unify on the axis where it hurts:

- **Definition / bundle: separate.** The color-adjustment chunk is its own tree-shakable, *registered*
  feature module (the successor to `registerGlColorAdjustmentMaterialFeature`). Absent from a bundle that never tints.
- **Batch identity: unified.** When present, the chunk composes *onto* the standard family as a
  **promotable variant**, not a distinct key. A mixed batch promotes to the adjustment variant
  (untinted members run it with an identity matrix); tinted + untinted still co-batch.

`DefaultMaterial` (today a fallback sentinel) is promoted to a real authorable `StandardMaterial`
(unlit textured base) that *supports* the adjustment feature — meaning it knows how to splice the chunk
when a batch needs it, **not** that every Standard draw carries a color matrix.

## The hard invariant: two shake-outs + the cardinality cost ladder

Untinted is the common case and must pay **nothing** — at bundle *and* runtime. 300,000 untinted
bunnies must not each carry a color matrix. Two independent guarantees, both required:

1. **Bundle shake-out (compile-time):** never enable the feature → the chunk code is not in the bundle.
2. **Runtime shake-out (per-batch):** even with the feature registered, the color-matrix variant is
   compiled/used **only for batches that actually contain tint**. A batch with zero tinted members runs
   the *base* program — no matrix uniform, no per-instance attribute, no multiply. Variant selection is
   driven by **data presence (cardinality), never by the material statically declaring a matrix field.**

The resolved color adjustment defaults to `null`; `null` is free. Cost scales by cardinality:

| Batch content | Data | Cost |
| --- | --- | --- |
| No tint (BunnyMark) | node tint `null`, per-item array `null` | base program — **zero** |
| One tint for the whole batch | node-level resolved transform | **one uniform** |
| Varying tints | per-instance attribute | **per tinted instance** |

Design rule for the note's readers:

> The color-adjustment chunk is a **registered, tree-shakable feature** of the shading families, **not**
> a field they carry. Variant selection is driven by **presence of a resolved color adjustment in the
> batch** — an all-untinted batch compiles and runs the base program with zero adjustment data or code.
> Default resolved tint is `null`; `null` is free at both bundle and runtime.

## Container participation — Sprite / QuadBatch / Tilemap / BitmapText

There is no per-container opt-in. A Sprite is a 1-quad batch, a QuadBatch an N-quad batch, a Tilemap an
N-tile batch, a BitmapText an N-glyph batch — all four go through the shared sprite-batch write path
(`prepareSpriteBatchWrite` / `recordSpriteBatchColorScaleBias`). Tinting is uniform across them and
driven by *which data slot is filled*. QuadBatch/Tilemap already implement this ladder today
(`materialData` per item, node-level fallback):

- **Untinted** → node tint `null` + `materialData` array `null` → base program (the 300k-quad case
  never touches the feature).
- **Whole-container** → `setNodeColorAdjustmentsTint(container, rgba)` → one uniform for the draw.
- **Per-item** → a per-instance setter (`setQuadBatchInstanceTint(batch, i, rgba)` /
  `setTilemapTileTint(map, col, row, rgba)`) writes the `materialData` slot, **lazily allocating** the
  per-item array on first use so an untinted container never carries it.

**Per-instance width, by cardinality too:** the common per-item case is a multiply-only tint = packed
**RGBA (4 bytes)** per instance. The per-instance tint attribute should default to packed-RGBA and widen
to the 8-float transform (offsets) or 4×5 matrix (mixing) only when actually present — so 300k *tinted*
particles cost 4 bytes each, not 32.

## Authoring vs realization

- **Authoring stays node-level:** `setNodeColorAdjustmentsTint(node, rgba)` (whole) and the per-item
  setters. Tint-any-node ergonomics, per-instance, batch-friendly. Authoring is **not** on the material
  (`setMaterialTint`) — that would fight per-instance batching and read worse.
- **Realization is the material feature:** the node's `resolvedColorScaleBias` (or per-item datum) flows
  into the Standard material's registered adjustment feature; the shared batch path selects the variant
  by presence. One implementation of "apply scale+bias / a color matrix" per backend, in the material
  compiler, reused by every family — replacing what would have been parallel per-renderer folds.

## What this direction resolved

Items deferred across the arc, all closed by this one consolidation:

- **3D per-object tint** — the promoted 3D families opt the same adjustment feature in, applied
  post-shade. The same chunk 2D uses, not a bespoke `tint`/`baseColor` special case.
- **`ColorScaleBiasAdjustment` / offsets** — the parked "retire `ColorTransformAdjustment`" resolved by
  *rename, not removal*: the kind became `ColorScaleBiasAdjustment` and the constructor
  `createColorScaleBiasAdjustment`, kept as the Flight-native bridge (offsets are the `bias` half). The
  full 4×5 mixing path is realized via `resolvedColorMatrix`, not deferred.
- **The 2D/3D asymmetry** — gone; both are material-driven, differing only in whether the feature is
  expected-on (2D Standard) or opt-in (3D families).
- **Per-backend duplication** — one registered feature, no parallel per-renderer folds.
- **`colorAdjustments` `Node` → `Node2D` demotion** — moot; authoring is dimension-agnostic on base
  `Node`, realization is the material feature, so the trait's home stopped mattering.

## As shipped (structure)

1. `DefaultMaterial` promoted to a real `StandardMaterial` (`glStandardMaterial` / wgpu twin), the shared default.
2. One color-adjustment shader chunk per backend in the material compiler, registered as a tree-shakable
   feature (`glColorAdjustmentMaterialFeature` / `wgpuColorAdjustmentMaterialFeature`) — the base compilers
   never statically import it.
3. The shared sprite-batch path routes the node's `resolvedColorScaleBias` (uniform) and per-item data
   (per-instance `a_colorScale`/`a_colorBias`) into the feature; `CT_MODE_NONE`/uniform/per-instance
   selected by cardinality, never splitting the batch.
4. The 3D families opt the same chunk in post-shade; the 3D proxy carries `colorScaleBias`.
5. `ColorTransform` → `ColorScaleBias` (value + bind), `createColorTransformAdjustment` →
   `createColorScaleBiasAdjustment` (bridge kept), `ColorTransformAdjustment` → `ColorScaleBiasAdjustment`.
   No compat aliases retained (`842689fa2`).

## Invariants (confirmed held in the shipped code)

1. **Untinted pays nothing** — bundle (feature unregistered → no chunk) *and* runtime (`CT_MODE_NONE` →
   lean base shader, no scale/bias data). The 300k-bunny gate holds.
2. **Tint never becomes a batch key** — it stays a per-instance attribute or promotable uniform variant;
   cardinality promotion fills with identity so it never forks z-interleaved batches.
3. **fuse vs splice stays visible** — a color-matrix modifier (data fold) and a fresnel modifier (code
   splice) realize incompatibly; they don't share a stack that implies they compose the same way.
