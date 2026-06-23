# Depth Review: @flighthq/scene

**Domain:** 3D scene graph — the spatial node hierarchy ("what exists" in a 3D world): a scene root, transform-only group nodes, and renderable mesh leaf nodes, plus the runtime/signal/world-matrix plumbing those nodes need to participate in a render walk.

**Verdict:** stub — **22/100**

The package is, by the project's own Package Map, "a doorway for future development; the road is mostly untaken and the package is not yet built out." That description is accurate. Three source files, twelve exported functions, ~100 lines of implementation. It defines the 3D node _family_ (Scene / SceneNode / Mesh constructors plus runtime and signal accessors) and nothing else. For the narrow job of "declare the 3D node kinds and their entity/runtime constructors" it is complete and clean; as an _authoritative scene-graph library_ it is a thin skeleton, because nearly every capability a scene graph is expected to own has been pushed to sibling packages.

It is important to separate two things this review is asked to keep separate:

- Much of what a "scene library" needs genuinely _exists in the codebase_, just not here: hierarchy ops (`addNodeChild`, `removeNodeChild`, `getNodeParent`, `getNodeRoot`, world-matrix resolution `ensureNodeWorldTransformMatrix4` / `getNodeWorldTransformMatrix4`, local↔global vector conversion) live in `@flighthq/node` against the shared `Transform3DNode` trait; the render walk (`prepareSceneRender`, `SceneRenderList`) lives in `@flighthq/render`; camera, lights, mesh geometry, materials, and GPU draw live in `camera`/`lighting`/`mesh`/`materials`/`scene-gl`. That is _missing-by-design_ under the cellular architecture and is breadth, not depth.
- But even discounting all of that, the `scene` package taken alone provides no scene-specific traversal, query, culling, instancing, or grouping convenience of its own. That is _missing-by-omission_ for a package whose name claims the scene-graph domain.

## Present capabilities

- `createSceneNode(kind?, obj?)` — allocates a transform-only 3D group node with an identity `localMatrix` (Matrix4), participating in the `SceneNodeTraits` (`HasTransform3D`) family. Custom-kind aware.
- `createScene(obj?)` — the 3D root, correctly modeled as just a `SceneNode` (`Scene = SceneNode`), with a clear note distinguishing it from `@flighthq/node`'s 2D layout `Scene` descriptor.
- `createMesh(geometry, materials, kind?, obj?)` — renderable leaf node carrying `MeshGeometry` + per-subset `(Material | null)[]`, stored by reference. Good doc comment on subset indexing and `DefaultMaterialKind` fallback.
- `isMesh(source)` — duck-typed leaf discriminator (presence of `geometry`), deliberately kind-agnostic so custom mesh kinds still classify; the render pass discriminates by this rather than by kind symbol. This is a thoughtful, correct design choice.
- Runtime + signal plumbing: `createSceneNodeRuntime`, `getSceneNodeRuntime`, `getMeshRuntime`, `enableSceneNodeSignals`, `enableMeshSignals`, `getSceneNodeSignals`, `getMeshSignals`. These wire the 3D nodes into the shared node runtime (`worldMatrix` slot initialized to null) and the opt-in signal model.

Tests are present and colocated for all three files (453 lines total), consistent with the exports-have-tests rule.

## Gaps vs an authoritative 3D scene-graph library

A mature scene-graph library (think the scene layer of three.js `Object3D`/`Scene`, Babylon's `Scene`/`TransformNode`, or a classic SG kernel) is expected to provide, in its own surface, most of the following. Almost none are present here even as re-exports:

- **Scene-level traversal and query.** No `traverseScene` / visitor walk, no `findSceneNodeByName`, no `getSceneNodeByName`, no predicate search, no ancestor/descendant iteration scoped to the 3D family. (`@flighthq/node` has generic hierarchy ops, but the scene package offers no traversal at all, not even a re-export, and there is no 3D-aware visit order.)
- **Spatial bounds and culling.** No scene-space AABB/bounding-sphere accumulation, no `getSceneNodeWorldBounds`, no frustum culling, no spatial partitioning (BVH/octree/grid). This is the defining feature of a _spatial_ scene library and is entirely absent. `MeshGeometry` may carry bounds, but scene exposes no API to aggregate or query them.
- **Pickable hit testing / raycasting.** No ray-vs-scene intersection, the canonical 3D selection primitive. Absent.
- **Transform convenience on the 3D node.** The node stores a raw `localMatrix` only. There is no TRS decomposition surface here (`setSceneNodePosition`/`Rotation`/`Scale`, quaternion helpers, `lookAt`, `setSceneNodeWorldMatrix`). World-matrix resolution exists in `@flighthq/node`, but a scene library is normally where position/rotation/scale ergonomics live; here they don't, in either package's scene-facing surface.
- **Grouping / instancing primitives.** No `Group` distinct from a bare node, no `InstancedMesh`, no LOD node, no billboard/sprite-3D, no bone/skeleton/skinned-mesh node, no morph targets. A `Mesh` and a transform group are the only two node shapes.
- **Scene composition.** No scene clone/merge, no subtree copy, no serialization/deserialization hook beyond the generic string-kind model, no scene-graph dirty/invalidation surface specific to 3D transforms.
- **Lights and camera as scene members.** Deliberately excluded by design (the doc comment states camera and lights are draw-arguments, not scene members). This is a legitimate Flight design choice, not an omission — but it does mean the package does not model a "scene" the way most libraries do.
- **Environment / scene state.** No fog, background, ambient/IBL environment, or scene-wide render settings. (Some live in `lighting`/render; none are surfaced here.)

The honest framing: of the canonical feature set, hierarchy + world-matrix + render-walk are _delegated by design_ to `node`/`render` (defensible). Traversal, bounds/culling, raycasting, TRS ergonomics, and the richer node taxonomy (instancing, LOD, skinning) are simply _not built anywhere scene-facing yet_ — which is the "road mostly untaken" the docs admit.

## Naming / API-shape notes

- Naming is clean and follows the codebase rules: full unabbreviated type words (`createSceneNode`, `getSceneNodeRuntime`, `enableMeshSignals`), `create*`/`get*`/`enable*`/`is*` prefixes used correctly, `Readonly<>` on accessor inputs, entity/runtime split honored.
- `Scene = SceneNode` is a good, honest type alias — and the inline comment disambiguating it from the 2D `Scene` descriptor is exactly the kind of ownership/aliasing note the style guide asks for.
- `isMesh` keying on `geometry` presence rather than kind is the right call for a string-kind, custom-kind-friendly model; well documented.
- One drift between docs and code: the `scene.ts` comment promises rendering via `prepareSceneRender + drawScene`, but `drawScene` does not exist — the GL path exports `drawGlScene` and `render` exports `prepareSceneRender`. The comment should name the real symbols (`prepareSceneRender` + a backend `draw*Scene`).
- `MeshGeometry`, `Material`, `Camera`, `SceneLights` are all only `devDependencies` / `@flighthq/types` references — appropriate, since scene stores them by reference and never operates on them. The package's runtime deps (`geometry`, `node`, `signals`, `types`) are minimal and correct.

## Recommendation

Treat this as a **stub that is correctly scoped but barely populated**, and be deliberate about where future depth lands. Two things are worth doing within this package's boundary to move it from stub toward solid, without violating the cellular split:

1. **Add 3D-scene-specific traversal and query as a thin, scene-aware layer**: `traverseSceneNode` (visit order suited to draw/update), `findSceneNodeByName`, and a predicate find. These are scene-graph table stakes and have no natural home in generic `node`.
2. **Add a scene-space bounds/cull surface**: `getSceneNodeWorldBounds` (aggregate child mesh bounds through world matrices) and a frustum-cull entry point that `prepareSceneRender` can consume. Spatial culling is the feature that justifies the word "spatial" in the package's description.

Larger items (raycasting/picking, instancing/LOD/skinning nodes, TRS ergonomics, scene serialization) are real gaps but are cross-cutting design decisions — surface them to the user as roadmap rather than building autonomously, since several touch `node`, `mesh`, and `render` boundaries. Until at least traversal + bounds/culling exist, `@flighthq/scene` should not be considered an authoritative scene-graph library; it is the node-family declaration for a 3D pipeline whose other organs live in sibling packages.
