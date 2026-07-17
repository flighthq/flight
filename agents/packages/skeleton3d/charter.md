---
package: '@flighthq/skeleton3d'
crate: flighthq-skeleton3d
draft: false
lastDirection: 2026-07-17
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# skeleton3d — Charter

Renamed from `@flighthq/skeleton` (2026-07-15). The original charter, review, assessment, and status remain in `agents/packages/skeleton/` until the code-level rename is executed; this cell is the forward reference.

## What it is

3D skeletal animation: joint hierarchies with 4×4 matrix transforms, inverse-bind matrices, skin-palette computation for GPU upload, blend trees, and 3D IK constraints. The domain Mixamo, Unity Mecanim, and Unreal's Animation Blueprint occupy — skeletal character animation for 3D games and applications.

This is the 3D half of skeletal animation. 2D skeletal animation is `@flighthq/skeleton2d` (bone hierarchies with 2D affine transforms, CPU mesh deformation, slot-based draw order, 2D IK). The split exists because the dimension changes the mathematical model: 3D uses Matrix4/quaternion joint transforms and GPU skin-palette upload; 2D uses affine bone transforms and CPU vertex warping. Different implementations, same vocabulary.

## North star

- Complete 3D skeletal animation pipeline. Joints, skins, morph targets, blend trees, constraints.
- Skin palette computation is a pure CPU operation with explicit out-parameter allocation.
- The package owns the bone/joint data model; animation playback and GPU skinning live elsewhere.

## Boundaries

- In scope: Skeleton entity, joint matrices, bind pose, SkinnedMesh node type, morph targets/blend shapes, IK constraints (long-term).
- Non-goals: animation playback (that's `animation`), GPU skinning shaders (`scene-gl`/`scene-wgpu`), 2D skeletal animation (`skeleton2d`).

## Skin import & deformation (blessed 2026-07-17) — committed through Phase 3

Triggered by the MD5 investigation: parsers (MD5 confirmed, glTF declared) parse per-vertex joint
weights but **bake a static bind pose and discard the skin** — so animation exists (the clip poses the
joint nodes) but nothing deforms. The primitives already exist and work (`createSkeleton3D`,
`computeSkeleton3DJointMatrices`, `skinVertices`); the GPU VAO slots (`joints0`/`weights0` at locations
6–7) are wired but dead. The gap is import (emit the skin) + one explicit deform call, not new math.

**The blessed shape (extends existing owners — no new package):**

- **Skinning is a geometry-layout-driven shader *variant*, not a new node family.** So a nullable
  **`Mesh.skin?: Skin | null`** field + a plain-data `Skin` descriptor live in `@flighthq/types` — **not**
  a distinct `SkinnedMesh` kind (which would duplicate Mesh's whole surface and fork renderer
  registration for zero gain, since GPU dispatch keys on *material* kind and the skin variant selects off
  the *layout*, exactly like `HAS_UV1`). This resolves the long-standing "SkinnedMesh node type" open
  question below. Per-mesh skinning scratch (de-interleaved bind pose, skinned output) lives on the
  runtime tier, not the entity.
- **CPU skinning is v1; GPU is an additive Phase-2 drop-in behind the same `Skeleton3D.jointMatrices`
  palette seam.** CPU (`skinVertices`) already works, runs on *all* backends (incl. canvas/dom), is
  jsdom-testable, and closes the gap now. CPU-vs-GPU is *which executor consumes the palette*, never a
  fact in the data model.
- **A shared skin-emit path in `scene-formats`** fed by per-format influence extraction: each parser
  produces raw `(jointIndices, weights)` + joint nodes + inverse-bind its own way, then one emitter packs
  4-influence `joints0`/`weights0` into an extended interleaved layout, builds `Skeleton3D`, regenerates
  normals, and sets `mesh.skin`. Mirrors the `scene-resources` emit-then-execute spine. Closes the
  joint-exposure gap for free: `mesh.skin.skeleton.joints` *is* the array `parseMd5Anim` needs.
- **Explicit deform, no magic:** extract the example's hand-coded interleave/deform into
  `skinMeshGeometry(geometry, skeleton, bindPose)` + a mesh-level `updateMeshSkin(mesh)` — **both in
  `@flighthq/skeleton3d` (which deps `@flighthq/mesh`)**, called each frame after
  `applyAnimationClipToScene`. (Placing `updateMeshSkin` in `@flighthq/scene` was the initial lean, but
  it created a project-reference dependency cycle; `skeleton3d` breaks it and is closer to the deform
  feature anyway — see Decisions.) Drop the example's `destroy*`-per-frame re-upload hack for a
  non-destructive version-bump path.

**Committed scope — Phases 1–3:**
- **Phase 1 (v1, CPU, all backends):** `Skin` + `Mesh.skin` in types; extended skinned-vertex layout;
  `skinMeshGeometry` + bind-pose helpers + `updateMeshSkin` in `skeleton3d`; MD5 emits skin +
  `Skeleton3D` + inverse-bind + normals and is wired mesh+anim end-to-end; the `skeleton` example
  rewritten as the clean few-named-calls recipe.
- **Phase 2 (GPU skinning):** `HAS_SKIN` vertex-shader variant + bone-palette UBO upload in `scene-gl`
  and `scene-wgpu` (slots already VAO-wired); selected from layout like `HAS_UV1`; same palette seam.
- **Phase 3 (glTF skins):** glTF `JOINTS_0`/`WEIGHTS_0` + `inverseBindMatrices` through the shared emit
  path (FBX/others later, same path).

**Phase 4 (morph targets / blend shapes; IK) is charted SEPARATELY — not in this commitment.** It is a
distinct vertex-deformation family (morph targets are not skeletal; IK is a solver), tracked in Open
directions and this package's North Star, to be chartered on its own when scheduled.

## Decisions

All decisions from the original `skeleton` charter apply. See `agents/packages/skeleton/charter.md` for the full history.

- **[2026-07-15] Rename from `skeleton` to `skeleton3d`.** Both 2D and 3D skeletal animation packages get explicit dimension suffixes for symmetry: `skeleton2d` and `skeleton3d`. User-directed.
- **[2026-07-17] Skin binds via a nullable `Mesh.skin` field + a plain-data `Skin` descriptor in `@flighthq/types`, NOT a `SkinnedMesh` node kind.** Skinning is a layout-driven shader variant, not a node family; a SkinnedMesh kind would duplicate Mesh's surface and fork renderer registration for no gain. User-approved.
- **[2026-07-17] Extend `skeleton3d` + `types` + `scene` + the GL/WGPU backends — no new `@flighthq/skinning` package.** The binding is small and splits cleanly across existing owners (data in types, deform math in skeleton3d, mesh glue in scene, GPU in the backends). User-approved.
- **[2026-07-17] CPU skinning is v1; GPU is Phase 2 behind the shared `jointMatrices` palette seam.** User-approved.
- **[2026-07-17] Commissioned through Phase 3 (CPU deform + GPU + MD5 & glTF import). Phase 4 (morph targets / IK) charted separately, not part of this commitment.** User-directed.
- **[2026-07-17] `updateMeshSkin` lives in `@flighthq/skeleton3d` (with a `mesh` dep), NOT `@flighthq/scene`** — reverses the earlier lean. Placing it in `scene` created a project-reference dependency cycle; `skeleton3d` breaks it and is closer to the deform feature anyway. `Skin = { skeleton, skeletonRoot? }`; bind pose on `MeshGeometryRuntime.skinBindPose`; float32x4 joints0/weights0 encoding; >4 influences → top-4 renormalized; MD5 normals regenerated, glTF normals parsed. User-approved (delivered parcel builder2-631cd71e; re-recorded after a sync dropped the original commit).
- **[2026-07-17] GPU skin palette is computed centrally in `prepareSceneRender`; the joint-matrix variant is geometry-driven via a render-state `activeSkinnedRun` flag folded into each prelude's program-cache key — so the ~15 material renderers are untouched and all 5 gl families (classic/unlit/toon/pbr/shaded) skin on GPU.** Consequence (footgun to guard later): on a GPU backend the app must NOT also call `updateMeshSkin`, or the mesh is skinned twice (CPU over GPU).

## Open directions

- ~~SkinnedMesh node type design~~ — **resolved 2026-07-17:** no SkinnedMesh kind; skin is a nullable
  `Mesh.skin` field (see the skin-import section above).
- ~~`updateMeshSkin` placement~~ — **resolved 2026-07-17:** lives in `skeleton3d` (+`mesh` dep), not
  `scene`, to break a project-reference cycle (see Decisions).
- Within Phases 1–3, pinned at build time: normal regeneration on import (MD5 regen / glTF parse);
  >4-influence handling (top-4 renormalized).
- **GPU skinning shader work is structurally verified only** (jsdom mocks don't compile shaders) — the
  MD5/glTF skinned render + GPU-vs-CPU parity need a host capture run. Tracked in the support matrix.
- **Double-skin guard** — a caller-facing guard for "GPU backend + `updateMeshSkin` called" (skinned twice).
- **wgpu GPU skinning deferred** to a host-GPU session — `maxBindGroups` forces the bone palette into a
  2nd vertex-visible binding in group 1 + a skinned pipeline/layout variant; gl-side seams already feed it.

**Phase 4 — separate track (morph targets / blend shapes; IK), not committed here:**

- Morph target data model: per-target attribute deltas vs interleaved blend shapes.
- IK solver scope: CCD, FABRIK, or analytical two-bone? All three?
- To be chartered on its own when scheduled — a distinct deformation family from skeletal skinning.
