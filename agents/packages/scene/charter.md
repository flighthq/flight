---
package: '@flighthq/scene'
crate: flighthq-scene
draft: false
lastDirection: 2026-07-03
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---


# scene — Charter

> Durable vision and core values for `@flighthq/scene`. You author this (via an agent transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

`@flighthq/scene` is the **3D scene graph** — the spatial node hierarchy of "what exists" in a 3D world: a scene root, transform-only group nodes, and renderable mesh leaf nodes, plus the node taxonomy (`Group`/`Mesh`/`InstancedMesh`/`LodMesh`/`Billboard`), the runtime/signal/world-matrix plumbing those nodes need to participate in a render walk, and the **spatial queries** over that graph (traversal, world AABB + bounding sphere, frustum culling, raycasting).

Where it ends and a neighbor begins:

- **vs `mesh`** — `mesh` owns vertex data (layouts, primitive builders, normals/tangents/bounds); `scene` owns the _node_ that references a mesh and its place in the spatial hierarchy.
- **vs `render` / `scene-gl` / `scene-wgpu`** — `scene` is render-free and side-effect-free. It _describes_ the world and _builds query results_ (e.g. a cull list); the GPU backends draw it. `scene` never imports render — the cull/draw seam is caller-driven and acyclic.
- **vs `node`** — `scene` is one graph family over the shared `@flighthq/node` hierarchy spine (the 3D counterpart to `displayobject`/`sprite`'s 2D graphs); it adds the `HasTransform3D` trait and 3D-specific queries, delegating generic hierarchy/signal plumbing to `node`.

It is the 3D family's spatial substrate — the spine that `scene-gl`/`scene-wgpu`, and future 3D features (lighting, environment, instancing draw, picking, skeleton/animation), compose against.

## North star

_Proposed durable principles, inferred from the realized design + the structural forks. Edit or demote any of these to Open directions — they are a draft, not blessed._

1. **Render-free, acyclic by construction.** `scene` describes the world and produces query results; it never reaches into render. The cull/render-walk seam is caller-driven — scene builds the list, the render walk consumes it — so the dependency arrow only ever points _out of_ render _into_ scene, never back. (Matches the codebase-map "rendering is something the caller invokes by name" rule; see Open direction 3 on whether this exact seam is the blessed one.)

2. **Plain data, free functions, explicit allocation.** Nodes are plain entities with a paired opaque runtime (`SceneNodeRuntime` holding the `worldMatrix` slot); operations are free functions with full unabbreviated names (`cullSceneNodeByFrustum`, `getSceneNodeWorldBoundingSphere`). Queries write into out-arrays / out-params and are alias-safe; `create*`/`clone*` are the only allocators. Hot-path queries (cull, raycast) must not allocate per element — use the geometry constructors and scratch state, never object-literal casts. (See Open direction 8 on raycast-hit allocation policy.)

3. **Types-first, homed in `@flighthq/types`.** Every cross-package shape (`SceneNode`, `Mesh`, `Group`, `Billboard`, `InstancedMesh`, `LodMesh`, `Ray3D`, `SceneRaycastHit`, `SceneRaycastOptions`, `SceneNodeVisitor`) is defined in `types` and re-exported — the header layer is the design surface, not inline package types.

4. **Strictly additive 3D (the bundle invariant).** Per structural fork G, full 3D is in scope and `scene` is a priority build-out — but a 2D app pays _nothing_ for it. No `scene` code lands in a 2D bundle; the 2D/3D split is a hard tree-shake boundary, enforced by a 2D example's `npm run size` baseline not moving. `scene` _composes_ the shared substrate (`render`/`geometry`/`node`/ `types`); it never intrudes on a 2D API.

5. **Sentinels over throws; presence-based discrimination.** Expected failures return `null`/`-1`/`false` (`findSceneNodeWhere`, `raycastSceneNodeFirst`, `selectLodMeshLevel`, `setInstancedMesh*`); throws are reserved for programmer error. Node kinds are discriminated by structural presence (`isMesh` keys on `geometry`), staying robust across custom kinds.

## Boundaries

_Proposed scope lines from the review + neighbors. The bar itself (minimal graph vs. three.js/Babylon-class) is Open direction 1 — these boundaries assume the realized surface, not a final ceiling._

**In scope (today, realized):**

- The spatial node hierarchy and taxonomy: scene root, `Group`, `Mesh`, `InstancedMesh`, `LodMesh`, `Billboard`; subtree clone and `dispose`.
- TRS ergonomics (`setSceneNodeTransform`, `setSceneNodeLookAt` as a _model_ matrix) and world-matrix plumbing.
- Traversal/find queries (pre/post-order, prune, by-name, predicate, out-array collection).
- World-space bounds: AABB and bounding sphere aggregation over Mesh descendants.
- Frustum culling (`buildSceneFrustum` + `cullSceneNodeByFrustum`) and raycasting (AABB broadphase + Möller–Trumbore, indexed/non-indexed, list/strip).
- Per-entity signal opt-in delegating to `@flighthq/node`.

**Non-goals / belongs elsewhere:**

- **Rendering / GPU upload** — `render`, `scene-gl`, `scene-wgpu`. `scene` builds cull lists; it does not draw, orient billboards, or upload instance buffers.
- **Vertex/geometry data** — `mesh` (and `geometry` math).
- **Generic hierarchy/signal mechanism** — `@flighthq/node`.
- **2D display-object concerns** — never reachable from `scene`.

**Open at the boundary (deferred to Open directions, not yet ruled):** acceleration structures (BVH/octree) as scene-internal vs. a neighbor package; skinning/animation node family in vs. out; serialization/scene-descriptor; per-node visibility/layer mask; instance-data home.

## Decisions

- **2026-07-03 — Keep standalone.** Skeleton, picking, animation remain separate packages. Why: each has significant room to grow.
- **2026-07-03 — Spatial acceleration (BVH/octree) in scope.** For culling and raycasting.
- **2026-07-03 — TS-leads, Rust conforms later.**

## Open directions

_Every candidate question from `review.md`, plus the structural forks that touch this package. This is where uncertainty lives — an agent asks here rather than assumes._

1. **North star / bar.** What defines "good" for `scene` — a minimal spatial graph + queries, or a full three.js/Babylon-class scene system (acceleration structures, layers, scene-level lighting/environment binding)? Fork G puts full 3D in scope and makes `scene` a priority build-out, but the per-package ceiling is still unstated.
2. **Boundaries: `Scene` vs `Group` vs bare `SceneNode`.** Three near-identical transform-only node forms exist (`Scene = SceneNode`; `Group` a distinct kind). Bless the intended distinction (root identity vs. named container vs. anonymous transform) or collapse it.
3. **Cull/render-walk contract ownership.** The build chose a caller-driven cull list (acyclic: scene builds → render consumes). Is that the blessed seam, or should `prepareSceneRender` own culling? This is the one cross-package design decision the build made implicitly; it should be ratified.
4. **Acceleration-structure home (fork E / bedrock).** BVH/octree as `scene`-internal vs. a `scene-spatial` neighbor — a decomposition/bedrock call. Today every cull/raycast query is O(n) over all meshes.
5. **Instance-data home (fork A: source-data vs graph participation).** Do per-instance matrices/colors belong on the `InstancedMesh` node (current) or a separate instancing/`mesh` data layer? Same sim-vs-node fusion fork A flags for particles↔sprite.
6. **Visibility/layer mask.** Is a `renderLayer`/visibility-mask field in scope? It is a `types` change coordinated with `render` and cull (today culling keys only on `enabled`).
7. **Skinning/animation node family.** `Bone`/`Skeleton`/`SkinnedMesh` in or out of `scene` (vs. a future `skeleton`/`animation` package, per fork G's within-3D boundary question)? The largest Gold item and cross-package (mesh skin weights + backend palette upload).
8. **Raycast result allocation policy.** Should hits be pooled/reused (acquire/release) for pointer-move-frequency picking, or is per-call allocation acceptable? Settles the raycaster cleanup the review flagged (per-hit object literals, `_createVector3` literal cast, dead no-op ternaries).
9. **Raycast normal accuracy.** Normals are transformed by the world matrix's upper-3×3, not its inverse-transpose — correct only under uniform scale. Is the inverse-transpose (correct for non-uniform/skewed meshes) in scope, or is the uniform-scale approximation blessed?
10. **Clone dispatch (fork B: closed union vs open registry).** `cloneSceneNode`'s `_cloneNode` is a closed `is*` cascade over the taxonomy. Fine while small (the "tight loop in a closed system" exception), but a candidate to flip to a per-kind `cloneNode` registry as the taxonomy grows. When does it flip?
11. **Serialization / scene descriptor.** Round-trip to a plain descriptor (needs a resource-key strategy; cross-package) — in scope for `scene` or owned elsewhere?
12. **Rust crate timing.** `flighthq-scene` is unstarted (TS authoritative, mirror downstream). When does the crate mirror land, and is the `crate: flighthq-scene` front-matter premature until then?
13. **Stale Package Map line (fork G doc reconciliation).** `agents/index.md` still calls `scene` "a doorway… the road mostly untaken… not yet built out," contradicting fork G's 2026-06-24 ruling. The line should be rewritten to describe the realized scene-graph + query surface — a doc-revision call for the user's gate.
