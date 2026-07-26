# Material Modifier Model — tinting, adjustments, and shading as one axis

**Status: proposed direction, not yet built.** This note records the design arc that unifies 2D
adjustments and 3D material modifiers into one model. It refines
[effect-adjustment-architecture](effect-adjustment-architecture.md); read that first for the
Material / Adjustment / Effect tiers as they exist today.

What is **shipped** (the groundwork this note builds on):

- `BitmapText` is a first-class leaf that owns its per-page glyph quads and draws through its own
  per-backend renderer (`gl`/`canvas`/`wgpu`), the Tilemap pattern — no child `QuadBatch` nodes, no
  `color` field.
- Tint is authored with `setNode2DColorAdjustmentTint(node, rgba)` over `createTintAdjustment(rgba)`
  (a diagonal `ColorMatrixAdjustment`); the orphan `setNode2DColorTransform` is gone. Tint round-trips
  as scene data and is realized by the gl/wgpu color-adjustment fold; canvas has no fold (honest by the
  absent `enableCanvasColorAdjustment`).

What is **proposed** (this note): relocate the color-adjustment fold out of the bespoke
`glColorAdjustment`/`wgpuColorAdjustment` path and into a **material feature** carried by the shading
families, unifying 2D tint and 3D per-object color under one model. Not yet implemented — needs the
user's go-ahead and is a material-compiler-scoped change on gl and wgpu.

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
was pulled out of materials into a per-node fold in the first place (`HasColorTransform`: "a tinted and
an untinted node with the same texture and blend batch together").

Split on the axis where it helps, unify on the axis where it hurts:

- **Definition / bundle: separate.** The color-adjustment chunk is its own tree-shakable, *registered*
  feature module (the successor to `enableGlColorAdjustment`). Absent from a bundle that never tints.
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

The resolved color transform defaults to `null`; `null` is free. Cost scales by cardinality:

| Batch content | Data | Cost |
| --- | --- | --- |
| No tint (BunnyMark) | node tint `null`, per-item array `null` | base program — **zero** |
| One tint for the whole batch | node-level resolved transform | **one uniform** |
| Varying tints | per-instance attribute | **per tinted instance** |

Design rule for the note's readers:

> The color-adjustment chunk is a **registered, tree-shakable feature** of the shading families, **not**
> a field they carry. Variant selection is driven by **presence of a resolved color transform in the
> batch** — an all-untinted batch compiles and runs the base program with zero adjustment data or code.
> Default resolved tint is `null`; `null` is free at both bundle and runtime.

## Container participation — Sprite / QuadBatch / Tilemap / BitmapText

There is no per-container opt-in. A Sprite is a 1-quad batch, a QuadBatch an N-quad batch, a Tilemap an
N-tile batch, a BitmapText an N-glyph batch — all four go through the shared sprite-batch write path
(`prepareSpriteBatchWrite` / `recordSpriteBatchColorTransform`). Tinting is uniform across them and
driven by *which data slot is filled*. QuadBatch/Tilemap already implement this ladder today
(`materialData` per item, node-level fallback):

- **Untinted** → node tint `null` + `materialData` array `null` → base program (the 300k-quad case
  never touches the feature).
- **Whole-container** → `setNode2DColorAdjustmentTint(container, rgba)` → one uniform for the draw.
- **Per-item** → a per-instance setter (`setQuadBatchInstanceTint(batch, i, rgba)` /
  `setTilemapTileTint(map, col, row, rgba)`) writes the `materialData` slot, **lazily allocating** the
  per-item array on first use so an untinted container never carries it.

**Per-instance width, by cardinality too:** the common per-item case is a multiply-only tint = packed
**RGBA (4 bytes)** per instance. The per-instance tint attribute should default to packed-RGBA and widen
to the 8-float transform (offsets) or 4×5 matrix (mixing) only when actually present — so 300k *tinted*
particles cost 4 bytes each, not 32.

## Authoring vs realization

- **Authoring stays node-level:** `setNode2DColorAdjustmentTint(node, rgba)` (whole) and the per-item
  setters. Tint-any-node ergonomics, per-instance, batch-friendly. Do **not** move authoring onto the
  material (`setMaterialTint`) — it fights per-instance batching and is worse ergonomically.
- **Realization becomes the material feature:** the node's resolved color transform (or per-item datum)
  flows into StandardMaterial's adjustment feature; the shared batch path selects the variant by
  presence. One implementation of "apply a color matrix" per backend, in the material compiler, reused
  by every family — retiring the parallel `glColorAdjustment` / `wgpuColorAdjustment` folds.

## What this direction resolves

Items deferred across the arc, all closed by this one consolidation:

- **3D per-object tint** — 3D families opt the adjustment feature in, applied post-shade as a color
  matrix (uniform per draw). The same fold 2D uses, not a bespoke `tint`/`baseColor` special case.
- **`ColorTransformAdjustment` / offsets** — subsumed. The chunk consumes a 4×5 matrix (or the 8-float
  affine fast path); offsets are entries in that matrix. No separate authored kind; the fold produces
  the matrix, the feature applies it. (This is the parked Commit-4 retire, re-homed.)
- **The 2D/3D asymmetry** — gone; both are material-driven, differing only in whether the feature is
  expected-on (2D Standard) or opt-in (3D families).
- **Per-backend duplication** — the parallel color folds collapse into one material feature.
- **`colorAdjustments` `Node` → `Node2D` demotion** — moot; authoring can stay node-level, realization
  is the material feature, so the node trait's home stops mattering the way it did.

## Migration sketch (high level, not code)

1. Promote `DefaultMaterial` → a real `StandardMaterial` (unlit textured), the shared 2D default.
2. Author the color-adjustment shader chunk once per backend in the material compiler; register it as a
   tree-shakable feature (successor to `enableGl/WgpuColorAdjustment`).
3. Route the shared sprite-batch path's resolved-color-transform (node uniform) and per-item
   `materialData` (per-instance attribute) into the feature; select base vs variant by presence.
4. Extend 3D families (Phong/PBR/Shaded) to opt the same chunk in post-shade.
5. Retire the standalone `glColorAdjustment` / `wgpuColorAdjustment` folds and, once nothing authors it,
   `ColorTransformAdjustment`.

## Invariants any implementation must not cross

1. **Untinted pays nothing** — bundle (feature unregistered → no code) *and* runtime (no tint in batch →
   base program, no matrix data). The 300k-bunny test is the gate.
2. **Tint never becomes a batch key** — it stays a per-instance/post-shade fold or a promotable variant,
   never a distinct material identity that forks z-interleaved batches.
3. **fuse vs splice stays visible** — a color-matrix modifier (data fold) and a fresnel modifier (code
   splice) realize incompatibly; don't let them share a stack that implies they compose the same way.
