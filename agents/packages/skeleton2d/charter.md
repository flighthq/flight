---
package: '@flighthq/skeleton2d'
crate: flighthq-skeleton2d
draft: false
lastDirection: 2026-07-15
review: ./review.md
assessment: ./assessment.md
status: ./status.md
rigModel: ./rig-model.md
---

# skeleton2d — Charter

## What it is

2D skeletal animation: bone hierarchies with 2D transforms (translate/rotate/scale), mesh deformation (weighted vertices over a 2D polygon mesh), slot-based draw order, and 2D IK constraints. The domain Spine, DragonBones, and Creature occupy — skeletal character animation for 2D games.

This is the 2D half of skeletal animation. 3D skeletal animation is `@flighthq/skeleton3d` (joint hierarchies, 4×4 inverse-bind matrices, GPU skin palettes, blend trees). The split exists because the dimension changes the mathematical model: 2D bone transforms use Matrix3/affine decomposition; 3D uses Matrix4/quaternion; 2D mesh deformation is CPU-side vertex warping over a 2D polygon; 3D skinning is a GPU vertex-shader pass over a volumetric mesh with a joint-palette uniform. The constraint solvers (2D IK vs 3D IK) differ in formulation. Different mathematical models, different implementations.

## North star

- **Bone tree with 2D transforms.** Each bone has local position (x, y), rotation (degrees), scale (sx, sy), and a parent reference. World transforms are computed by walking the tree, composing 2D affine matrices.
- **Mesh deformation.** A 2D polygon mesh (triangulated) with per-vertex bone weights. CPU-side vertex warping: each vertex is transformed by its weighted bones and written into a deformed vertex buffer for rendering.
- **Slot-based draw order.** A slot is an attachment point on a bone with a draw-order index. Slots determine which image/mesh/region attachment is visible and in what order — the 2D-specific equivalent of a material slot.
- **Plain-data skeleton, explicit step.** `Skeleton2D` is a plain entity. `updateSkeleton2D(skeleton)` recomputes world transforms; `applySkeleton2DMeshDeform(skeleton, mesh, out)` writes deformed vertices. No implicit updates.
- **No display-object dependency in the skeleton package.** The skeleton is a data model; the display integration (a `SkeletonSprite` display node) would be a composition layer like `particleemitter`, not here.

## Boundaries

**In scope:**

- Bone hierarchy: create, parent, local/world transform computation.
- Mesh deformation: weighted vertex skinning in 2D (CPU-side).
- Slots and attachments: region (sprite), mesh, bounding box, path, clipping.
- 2D IK constraints: two-bone analytical IK, CCD chain IK.
- Transform constraints: bone-to-bone copy/inherit with mix.
- Path constraints: bone chains following a `@flighthq/path` curve.
- Animation data model: bone/slot/constraint timelines with curve interpolation. (Playback uses `@flighthq/animation`.)
- Skin sets: named collections of slot→attachment mappings (character customization).

**Non-goals:**

- 3D skeletal animation — `@flighthq/skeleton3d` (Matrix4, GPU skin palettes, blend trees).
- Spine/DragonBones file format import — a future `skeleton2d-formats` neighbor.
- Display-object integration — a composition layer (`skeletonsprite`?) owns the display node.
- Animation playback — `@flighthq/animation` drives timelines; this package owns the data + apply.

**Dependencies:** `geometry` (Matrix, Vector2), `math`, `node` (if the bone tree uses the hierarchy), `types`.

## Decisions

- **[2026-07-15] Separate package from 3D skeleton.** Different mathematical model: 2D affine transforms vs 4×4 matrices, CPU mesh warp vs GPU skin palette, 2D IK vs 3D IK. User-directed.
- **[2026-07-15] Named `skeleton2d`; 3D is `skeleton3d`.** `skeleton` is the domain word; the `2d`/`3d` suffix follows the physics pattern. Both dimensions get explicit suffixes — the existing `@flighthq/skeleton3d` renames to `@flighthq/skeleton3d`. User-directed.

- **[2026-07-25] Self-contained flat bone array, NOT `@flighthq/node` hierarchy (resolves open direction #1).** `Skeleton2D` owns its bones as a flat index-addressed array; each `Bone2D` carries a `parentIndex` and its local setup transform (x, y, rotation°, scaleX, scaleY, shearX, shearY). This is the decisive divergence from `skeleton3d`, whose `joints` are external posed `Node3D`s it only *reads* world matrices from. 2D skeletal runtimes (Spine/DragonBones/Creature) **own** their skeleton, so skeleton2d **computes world transforms itself** — a single linear pass over a topologically ordered array (`parentIndex < selfIndex`), `world[i] = world[parentIndex] × local[i]`, allocation-free, cache-friendly. `@flighthq/node`'s hierarchy would couple the skeleton to the display/scene graph and add signal/traversal weight a flat bone pose loop does not need. World transforms are stored (reused by both attachments and the skin palette); this mirrors skeleton3d's flat-`Float32Array` buffer model, just self-propagated. Bones stay ordered parent-before-child (an authoring/import invariant `validateSkeleton2D` checks).
- **[2026-07-25] Deform output is a flat interleaved `Float32Array` of 2D positions (resolves open direction #2).** Weighted mesh deform writes `[x0,y0, x1,y1, …]` into an `out` `Float32Array`, mirroring `skinVertices`' flat-typed-array kernel — renderer-neutral, so a display composition layer feeds it to the sprite/quad-batch or shape pipeline as it chooses. No `@flighthq/path` contour coupling in the core.
- **[2026-07-25] Mirror skeleton3d's conventions.** `Skeleton2D extends Entity`; all exported types live in `@flighthq/types` (the impl package exports functions only); `create*`/`clone*`/`clone*BoneHierarchy(callback)`/`dispose*`/`equals*`/`validate*` lifecycle; one out-param palette compute (`computeSkeleton2DBoneMatrices`); a pure CPU deform kernel (`deformSkeleton2DVertices`) + node/geometry driver; sentinel-return (`-1`/`false`/`null`) over throw; `Readonly<>` on every non-mutated param; module scratch for the alloc-free hot path. Deform is a field/composition, not a `*Kind` (no `SkeletonSprite2DKind` in this package). GPU skin upload, if ever, follows skeleton3d's opt-in data-texture-palette pattern — but 2D v1 is CPU-only (2D skinned meshes are small; the CPU kernel is the whole path).
- **[2026-07-25] Phased AAA build; phase 1 = bone tree + weighted deform + slots/attachments.** P1 (this pass): flat bone tree, world propagation, bind pose + inverse-bind, weighted CPU mesh deform, and the slot/attachment transform model (bone drives a region/mesh attachment). P2: 2D IK (two-bone analytical + CCD chain), transform constraints, path constraints (over `@flighthq/path`). P3: skin sets (named slot→attachment collections), animation timelines (curve interpolation, played by `@flighthq/animation`), clipping attachments. Mirrors skeleton3d's phased delivery (CPU core first, constraints/mixing later).

## Open directions

1. **Display integration package name.** `skeletonsprite`? `skeleton2d-display`? Follows the `particleemitter` pattern — a composition layer that owns the display node. (Deferred; not this package.)
2. **Relationship to Spine runtime.** Spine has its own runtime format. Should `skeleton2d` be Spine-compatible (same data model, so the format parser maps 1:1) or Flight-native (optimized for Flight's patterns, with a lossy Spine import)? Leaning Flight-native with a faithful Spine import in `skeleton2d-formats`. (Resolve when chartering `skeleton2d-formats`.)
3. **~~Bone `transformMode` / inherit flags (P2).~~ MOVED TO P1 (review-directed 2026-07-25).** Spine bones choose how they inherit parent rotation/scale (Normal / OnlyTranslation / NoRotationOrReflection / NoScale / NoScaleOrReflection). This is read *during* the single linear world-composition pass — a per-`Bone2D` field + a branch, not a constraint — so it must be in P1: retrofitting it would rewrite the hot world loop. Modeled as a closed `TransformMode2D` enum (finite, hot-dispatched → closed union + `switch`, per types-layout) on `Bone2D`, honored in `computeSkeleton2DWorldTransforms`. (IK and transform/path *constraints* stay P2.)
4. **Shear in the P1 local transform.** `Bone2D` carries `shearX`/`shearY` for Spine fidelity, and the local-matrix builder composes shear (manual 2×3, since `setTransformMatrix` is scale+rotate+translate only). If shear proves unused by early consumers it can default to 0 with the builder short-circuiting — kept in the type from the start so the header is stable.
