# 3D Pipeline Architecture

**Status: blessed direction (2026-06-25 session).** This is the authoritative design for the 3D pipeline build-out. It complements — and does not restate — the existing blessed docs: [`render-architecture.md`](render-architecture.md) (the render target/pass substrate) and [`3d-materials-architecture.md`](3d-materials-architecture.md) (the 20-material PBR taxonomy, built). 3D is **in scope** per [structural fork G](packages/structural-forks.md#g-sdk-scope-ongoing-first-ruling-made); this doc settles _how_ it is shaped. The builder's Phase-4 work (currently parked) executes against this.

## Binding constraint — 3D is strictly additive (from fork G)

A 2D app pays **nothing** for 3D. This is the hard gate every decision below respects:

- No 3D code in a 2D bundle — the 2D/3D split is a hard tree-shake boundary; `scene` never imports from `displayobject`; the mesh-material registry is a **separate** `WeakMap` from the 2D quad-material registry.
- **Enforced, not promised:** a 2D example's `npm run size` baseline must not move when a 3D package is added. That size gate is the acceptance test for every 3D package.

## Carried-forward settled decisions (from render-architecture)

- **Camera and lights are draw-arguments, not scene members** (optional future `CameraNode`/`LightNode`
  - `findSceneCameras`/`findSceneLights` stay additive).
- **`Texture` is the only 2D↔3D bridge** — no bridge node types.
- **`gl` + `wgpu` carry full 3D parity; Canvas/DOM stay 2D-only.**
- **Build phasing:** core-lit (20 materials, directional+ambient) → shadows → IBL → transmission/area.

## Decisions (this session)

### 1. Explicit named passes, not a render-graph (for now)

Multi-pass orchestration is **explicit named functions the app sequences** (`drawSceneShadowMaps` → `bakeEnvironmentIbl` → draw-opaque → draw-transmissive). The pass _order is the documentation_; nothing auto-runs. A render-graph's only real engineering win — transient GPU-target pooling/aliasing — is already an explicit primitive (`glRenderTargetPool`). A render-graph, if ever wanted, is an **opt-in convenience layer over** these functions, never the only path (so the bundle gate and the no-magic rule hold). Revisit only if pass count/complexity makes manual sequencing genuinely unmanageable.

### 2. `picking` — standalone 3D ray resolution

3D picking is hit-testing by **camera raycast** (ray ↔ triangle/AABB/sphere — the Phase-1 geometry raycasting). It is a **different domain** from `@flighthq/interaction` (2D point-in-shape) with its own standard name. Keep them distinct; they share the pointer-event source, not the resolver. Standalone **`@flighthq/picking`**, mirroring interaction's role for 3D. API shape: `pickScene(scene, camera, screenX, screenY, out): SceneHit | null` (node + barycentric + distance). **Brute-force ray/triangle first**; a per-`MeshGeometry` BVH is a later _additive_ optimization (a runtime slot), not a v1 requirement.

### 3. `shadow` + `environment` — recipes over primitives (package-vs-recipe deferred)

Both are **recipes** (compositions of passes over `render-gl`/`render-wgpu`, `texture`, `lighting`), analogous to how `effects` are descriptors applied by backend functions — not heavyweight packages by default. Whether each earns a standalone package vs. living as passes in `scene-{backend}` is a **build-time discernment**, decided by how substantial the recipe surface turns out.

- **`shadow` ≠ `lighting`.** `lighting` is light _data_; shadow is the _passes_ that render scene depth from a light's POV into a shadow map and sample it during shading. A **shadow camera is just a `Camera` placed at the light** — no new type. (directional = ortho, spot = perspective, point = cube; PCF filtering.)
- **`environment`** = image-based lighting (IBL) + skybox: an HDR env map → irradiance + prefiltered specular + BRDF LUT, plus the backdrop draw. Distinct from punctual lighting; the **bake is the substantial part**; pairs with `texture` (cubemaps).

### 4. `postprocess` — not a package; reuse `effects-*`

3D post-processing is the **existing `effects-*` pipeline** (bloom/tonemap/exposure already exist) applied to the scene's color target. No new `postprocess` package.

### 5. `instancing` — a draw-path option, not a package

Mesh _reuse_ (many `SceneNode`s referencing one `MeshGeometry`) is already free. **Instancing** is the GPU optimization to draw N copies in one call with a per-instance buffer (transform/tint), for forests/crowds/mesh-particles. It is a **draw-path variant in `scene-{backend}`/`mesh`**, not a new data type or package.

### 6. A shared animation core (3 tiers)

The bedrock is **sampling a value from keyframes at time `t`**; everything layers on it. Matches how glTF/Three cut it.

- **Tier 1 — sampler (bedrock; value-typed, no targets, alloc-free):** `Keyframe = { time, value }` (+ optional tangents); `AnimationTrack` = ordered keyframes + interpolation mode (step/linear/cubic); `sampleAnimationTrack(track, t, out)` per value type (number / `Vector3` / `Quaternion` (slerp) / packed color), using `@flighthq/easing`.
- **Tier 2 — clip + playhead (shared):** `AnimationClip = { duration, channels[] }` where a channel = `{ track, targetRef }` and **`targetRef` is opaque to the core** (the binding seam). `AnimationPlayer` = the time driver (`advanceAnimationPlayer(player, dt)`, seek, loop, speed) — **explicit, the app advances it each frame**; blending/crossfade is an optional layer on top.
- **Tier 3 — bindings (domain-specific, compose the core):** 3D `animation`/`scene` (channels → node TRS / morph weights), `skeleton` (bone-transform channels + skinning, rides on animation), `tween` (1-channel/2-keyframe clip under its ergonomic API), `timeline` (2D step-tracks + frame scripts on the same playhead), `easing` (the curves the sampler calls).

**Tree-shaking holds** because the sampler/clock are shared but the bindings are separate: a `tween` user pulls only the sampler; a 3D user pulls sampler + scene binding; neither drags in the other.

**Dependency direction — `animation` is its own package, kept target-free and 3D-free.** Tiers 1–2 are the `animation` package: value-typed sampler/clip/player with an **opaque `targetRef`** and _zero_ 3D in it. The 3D node/morph binding (apply a clip's channels to `SceneNode` TRS) lives in **`scene`**, and the bone binding in **`skeleton`** — _not_ in `animation`. So the graph is a clean DAG with no domain→domain and no 2D→3D edges:

```
easing  ←  animation  ←  { scene, skeleton, tween, timeline }
```

This is the answer to "would `tween`/`timeline` depend on `animation`, or is the sampler its own package?" — **both, resolved by keeping `animation` itself the shared, target-free core.** `tween` and `timeline` (if refactored) depend on `animation`, and that edge is safe precisely because `animation` carries no targets and no 3D — there is no separate "3D-animation" package for them to wrongly pull. The 3D-ness is in `scene`/`skeleton`, which sit above the same core. (`animation` clears bedrock on its own: per-type sampling + tracks + clips + a playhead is a real subsystem, e.g. Three's KeyframeTrack/AnimationClip/AnimationMixer — not blood-from-a-stone.)

**Adoption rule:** build the core now for 3D `animation` + `skeleton` (glTF imports channel/sampler/clip straight into it — not speculative). Design it so `tween`/`timeline` _can_ adopt it later, but **do not force-refactor those working 2D packages in this pass** — they migrate when it's worth it.

### 7. `skeleton` — bones on top of animation

Bones/joints hierarchy + skinning (vertex→bone weights) + inverse-bind matrices. Bones are just animated _targets_ of the animation core; skin deforms the mesh from bone transforms. Rides on Tier 2/3, does not duplicate the sampler. (Names `skeleton`/`animation` may be refactored later.)

### 8. `scene-formats` / glTF — the import codec

glTF (`.gltf`/`.glb`) is the standard 3D interchange format and is effectively a **serialized Flight 3D scene**: node hierarchy, meshes, PBR metallic-roughness materials (→ the 20-material taxonomy), textures/ samplers, cameras, punctual lights, skins (skeletons), animations (channel/sampler clips). So glTF is a **codec** that _populates_ `scene`/`mesh`/`materials`/`texture`/`animation`/`skeleton` — the 3D analogue of `image-formats` decoding a PNG into an `ImageSource`. Housed in **`scene-formats`** per the `<subject>-formats` triad convention (glTF the primary parser; USD/OBJ later satisfy plurality). Extensions are the scope dial: `KHR_materials_*` map onto the material taxonomy, `KHR_texture_transform` is already supported by `texture`'s uv-transform, `KHR_draco`/`EXT_meshopt` are compressed geometry, `KHR_lights_punctual` for lights.

## Build sequencing

1. **`picking`** (consumes Phase-1 raycasting; smallest, immediately useful).
2. **`scene` core-lit** — promote from stub: `Scene` root + `Mesh` node (`geometry` + `materials[]`) + transform-only `SceneNode` group, `prepareSceneRender` (world matrices, frustum cull via Phase-1 frustum helpers, pack light block). Mirrors the 2D `node`/`displayobject` split.
3. **shadows** (recipe; directional first).
4. **environment / IBL** (bake + skybox).
5. **animation core + `skeleton`**.
6. **`scene-formats` / glTF** (depends on all the above being in place to populate).

## Open within-3D (decide at build time, not now)

- **Package-vs-recipe** for `shadow` and `environment` — discernment once the recipe surface is known.
- **Whether `tween`/`timeline` adopt the animation core** — deferred; the core is built adoptable, the 2D packages migrate later if/when worth it.
- **glTF extension scope** — which `KHR_*`/`EXT_*` beyond the core set, settled when `scene-formats` is built.
