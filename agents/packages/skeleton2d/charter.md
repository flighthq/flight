---
package: '@flighthq/skeleton2d'
crate: flighthq-skeleton2d
draft: false
lastDirection: 2026-07-15
review: ./review.md
assessment: ./assessment.md
status: ./status.md
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

## Open directions

1. **Bone tree vs `@flighthq/node` hierarchy.** Should the bone tree use `@flighthq/node`'s hierarchy (addNodeChild/removeNodeChild) or its own lighter array-based tree? Node hierarchy brings signals and traversal for free but may be heavier than needed for a flat bone array.
2. **Mesh deformation output format.** Write into a Float32Array that the sprite/quad-batch renderer can consume directly? Or into a `@flighthq/path`-compatible contour for rendering through the shape pipeline?
3. **Display integration package name.** `skeletonsprite`? `skeleton2d-display`? Follows the `particleemitter` pattern — a composition layer that owns the display node.
4. **Relationship to Spine runtime.** Spine has its own runtime format. Should `skeleton2d` be Spine-compatible (same data model, so the format parser maps 1:1) or Flight-native (optimized for Flight's patterns, with a lossy Spine import)? Probably Flight-native with a faithful Spine import in `skeleton2d-formats`.
