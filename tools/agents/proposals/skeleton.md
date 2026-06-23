---
id: skeleton
title: '@flighthq/skeleton'
type: new-package
target: skeleton
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/skeleton.md
  - tools/agents/docs/reviews/breadth/animation-motion.md
  - tools/agents/docs/reviews/breadth/spatial-3d.md
depends_on: []
updated: 2026-06-23
---

## Summary

Skeletal/bone animation runtime — joint hierarchy, inverse-bind matrices, skinning palette, pose evaluation, IK, and authored-format importers (Spine/DragonBones for 2D; glTF skins for 3D) — that consumes mesh `joints0`/`weights0` and pairs with the clip/animation evaluator.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable skinned-character runtime: import a skeleton, pose it, produce a palette, draw it.

- **Types in `@flighthq/types` first:** `Joint` (name, parent index, local `Transform3D` bind pose), `Skeleton` (ordered `readonly Joint[]`, name→index lookup), `SkeletonPose` (per-joint local TRS array — the mutable working state), `Skin` (joint index list + `readonly Matrix4[]` inverse-bind matrices), `SkinningPalette` (the flat `Float32Array` joint-matrix buffer + joint count), `SkinKind` / `SkeletonKind` string `*Kind` identifiers.
- **Construction (`create*`, may allocate):** `createSkeleton(joints)`, `createSkeletonPose(skeleton)` (initialized to bind pose), `createSkin(jointIndices, inverseBindMatrices)`, `createSkinningPalette(jointCount)`.
- **Pose evaluation (out-param, hot-path safe):** `computeSkeletonWorldMatrices(out, skeleton, pose)` (local→model walk in joint order), `computeSkinningPalette(out, skin, worldMatrices)` (world × inverse-bind, the buffer the shader reads), `computeInverseBindMatrices(out, skeleton)` (derive from bind pose when an importer omits them).
- **Lookup (sentinels):** `getSkeletonJointIndex(skeleton, name)` → `-1` if absent, `getSkeletonJointParentIndex`, `getSkeletonRootJointIndices`.
- **Importer (Bronze: the 2D dominant path) in `@flighthq/skeleton-formats`:** `parseSpineSkeleton(json)` → `{ skeleton, skins, clips }`, `parseSpineSkeletonDocument(json)` (raw parsed form, matching the `…Document` convention). Spine is the requested 2D priority and the import muscle already exists (`particles-formats` parses Spine).
- **Renderer wiring (opt-in, in the GPU mesh packages):** the skinned vertex path that multiplies position/normal by the palette via `joints0`/`weights0` — `enableGlSkinnedMeshSupport(state)` / `enableWgpuSkinnedMeshSupport(state)` registering a skinned variant keyed on `SkinKind`. (Lives in the render packages, not here, per the kind-registration rule.)
- **Tests + one functional scene:** a single rigged quad/character posed and skinned, checked across GL/WGPU; colocated unit tests for the matrix walk and palette math (including the aliased `out === input` case).

### Silver

Competitive with a well-regarded skeletal library: blending, IK, full keyframe binding, and the second 2D + the 3D importer.

- **Types:** `IkConstraint` (chain joint indices, target, pole, iterations, kind), `IkConstraintKind` variants (`TwoBoneIk`, `FabrikIk`, `CcdIk`), `SkeletonBlendTrack` (pose + weight), `JointMask` (per-joint blend weights for layered/partial-body blends), `BindPose` (immutable reference distinct from the working `SkeletonPose`).
- **Pose blending:** `blendSkeletonPoses(out, a, b, t)` (per-joint quaternion `slerp` + lerp), `addSkeletonPoseLayer(out, base, additive, weight, mask)` (additive/override layered blends), `applyJointMask(out, pose, mask)`. These are what turn "play one clip" into character animation.
- **Inverse kinematics:** `solveTwoBoneIk(out, pose, skeleton, constraint)` (analytic two-bone — the workhorse for limbs), `solveFabrikIk(out, …)` and `solveCcdIk(out, …)` for longer chains, `solveSkeletonIkConstraints(out, pose, skeleton, constraints)` (apply an ordered constraint stack), with pole/twist and per-joint angle limits.
- **Clip binding (pairs with `@flighthq/clip`):** `createSkeletonClipBinding(skeleton, clip)` resolving channel targets to joint indices once, `sampleSkeletonPose(out, binding, time)` writing a `SkeletonPose` from a channel/sampler clip (TRS tracks + step/linear/cubic interpolation). Bridges the keyframe evaluator to bones the way `createSpritesheetTimelineSource` bridges spritesheet→timeline.
- **Spine completeness in `-formats`:** Spine bone constraints (transform/path constraints), slot draw order, attachment skins, `parseSpineSkeletonBinary` for `.skel`; `serializeSpineSkeleton` for round-trip.
- **Second 2D importer:** `parseDragonBonesSkeleton(json)` / `…Document` (the other dominant 2D rig format named in the review).
- **3D importer:** `parseGltfSkin(gltf, skinIndex)` extracting joints + inverse-bind matrices + skinned `MeshGeometry` `joints0`/`weights0` from a glTF skin (sits beside the future `gltf`/`model-formats` loader; consumes its parsed document rather than re-parsing GLB).
- **Signals (opt-in group):** `enableSkeletonSignals(skeleton)` exposing `onPoseEvaluated` / `onIkSolved` for tooling/debug overlays, off by default.
- **Cross-backend consistency** the palette is identical across GL/WGPU; functional parity scene with an IK-driven limb plus a two-clip blend.

### Gold

Authoritative, AAA, production-grade — exhaustive coverage, performance, and 1:1 Rust parity.

- **Pose-space & retargeting:** `retargetSkeletonPose(out, source, target, mapping)` (rig-to-rig joint mapping), `createSkeletonRetargetMapping(source, target)`, humanoid-bone tagging (`HumanoidBone` enum: hips/spine/chest/leftUpperArm/…) for source-agnostic retargeting, and bind-pose normalization between rigs of different proportions.
- **Advanced IK & secondary motion:** pole vectors, soft IK / reach limits, twist distribution, look-at constraints (`solveLookAtConstraint`), spring-bones / jiggle (`stepSkeletonSpringBones(out, pose, springs, deltaTime)`) for cloth/hair/tails, and physics-aware constraint ordering.
- **Skinning quality:** dual-quaternion skinning palette (`computeSkeletonDualQuaternionPalette`) alongside linear-blend, joint-count/influence limits with weight renormalization (`normalizeMeshSkinWeights`, `limitMeshSkinInfluences`), and a CPU skinning fallback (`skinMeshGeometryCpu(out, geometry, palette)`) for software/`displayobject-skia` and headless capture where no GPU palette upload exists.
- **Morph / blend-shape integration:** `applyMeshMorphTargets(out, geometry, weights)` so skeletal + morph (facial) animation compose — the review flags missing morph/vertex-interpolation explicitly.
- **Performance:** a `SkeletonPosePool` / `SkinningPalettePer` pool (`acquire*`/`release*`), in-place world-matrix scratch reuse, dirty-joint partial re-evaluation, and palette upload batching helpers consumed by the GPU renderers; documented allocation boundaries.
- **Exhaustive importers in `-formats`:** Spine full feature set (mesh/weighted/clipping/point/region attachments, events, animation curves, IK/transform/path constraint timelines), DragonBones full (armatures, slots, ffd/mesh deformation), glTF skins with all interpolation modes and sparse accessors, plus serializers for round-trip. `parseSpineAtlas` for the companion atlas where it informs slot attachment.
- **Editor/tooling surface:** `getSkeletonBounds(out, skeleton, pose)`, `getJointWorldTransform(out, …)`, debug-draw data emitters (bone segments, joint axes, IK targets) consumed by a future 3D debug-draw, and validation helpers (`hasSkeletonCycle`, `isSkeletonPoseFinite`) returning sentinels.
- **Tests, docs, and Rust parity:** colocated unit tests for every export (aliased `out` cases throughout), functional/regression scenes for skinning, IK, blend, retarget, and spring-bones; conformance-mapped `flighthq-skeleton` + `flighthq-skeleton-formats` crates with parity-checked palette/pose fingerprints (deterministic value math → ideal first-tier conformance target alongside `surface`/`geometry`).

## Boundaries

- **Keyframe/clip evaluation lives in `@flighthq/clip`** (channels, samplers, interpolation, the time domain). Skeleton consumes a clip via `createSkeletonClipBinding`; it does not own the animation-clip type or the playback clock. The shared animation state-machine / blend-tree, if built, is a separate concern that drives clips and feeds poses here.
- **Parsers/serializers live in `@flighthq/skeleton-formats`**, not the runtime, so importer weight (Spine binary, DragonBones, glTF) stays out of a pure-playback bundle — the `-formats` neighbor pattern.
- **GPU skinned-draw and palette upload live in the render packages** (`displayobject-gl/-wgpu`, `scene-gl/-wgpu`) behind `enable*`/`register*`; this package only produces the CPU-side `SkinningPalette` value. CPU software skinning (`skinMeshGeometryCpu`) is the one exception, for backends without a shader palette.
- **Mesh vertex storage stays in `@flighthq/mesh`** — `joints0`/`weights0` are `MeshGeometry` semantics; skeleton reads them, does not redefine the vertex layout. Weight normalization/influence-limiting helpers operate on `MeshGeometry` but live here as a skinning concern.
- **Cross-package shared types go in `@flighthq/types` first** (`Joint`, `Skeleton`, `Skin`, `SkinningPalette`, `IkConstraint`, the `*Kind` strings); nothing cross-boundary is defined inline in the runtime.
- **2D display-object (Spine-on-Canvas) rendering** is a render-package concern, not skeleton's: skeleton emits posed bone transforms and a palette; whether a Spine rig draws as batched quads (2D) or skinned mesh (3D) is decided by the renderer consuming it.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **One skeleton concept for 2D and 3D, or two?** Spine/DragonBones are 2D bone hierarchies (2×3 affine, draw-order slots); glTF skins are 3D (4×4, inverse-bind). A single `Joint`/`Skeleton` over `Transform3D` covers both (2D is a Z-flat case), but 2D rigs add slots/attachments/draw-order that have no 3D analogue. Proposal: one `Skeleton`/`Skin`/palette core; keep 2D slot/attachment/draw-order data in the format-import result and a thin `SkeletonSlots` companion, not on the core `Skeleton`.
- **Where do Spine slots, attachments, and draw order live?** They are 2D-presentation, not skeleton-pose. Candidate homes: a `skeleton`-owned `SpineSkin`/`SlotOrder` type, or pushed entirely into `skeleton-formats` output consumed by a 2D renderer. Leaning toward the latter to keep the runtime backend-agnostic.
- **Palette format coupling.** `SkinningPalette` as a flat `Float32Array` of `mat4`s matches GL/WGPU UBO/SSBO layout, but dual-quaternion skinning wants a different stride. Decide whether the palette type is layout-tagged (`SkinningPaletteKind`: `LinearBlend` | `DualQuaternion`) so renderers pick the matching shader, vs. two distinct palette types.
- **IK as constraints-on-pose vs. a solver graph.** Spine models IK/transform/path as ordered constraints; a general 3D rig may want a richer solver. Proposal: an ordered `IkConstraint[]` stack solved in place (`solveSkeletonIkConstraints`) covers both without a graph; revisit only if full-body IK is requested.
- **Clip↔skeleton ownership of the binding cache.** Resolving channel targets to joint indices is a one-time cost; does the resolved `SkeletonClipBinding` live here (skeleton-owned, clip-agnostic) or as a generic node-target binding in `clip`? Leaning skeleton-owned since the joint-index resolution is skeleton-specific.
- **Retargeting scope for Gold.** Full humanoid retargeting (Mecanim-style) is a large surface; confirm whether Gold needs source-agnostic humanoid retargeting or only same-topology rig remapping. The former is a multi-session effort and may warrant its own neighbor (`skeleton-retarget`).

## Agent brief

> Create `@flighthq/skeleton` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
