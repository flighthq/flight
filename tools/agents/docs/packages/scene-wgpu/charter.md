---
package: '@flighthq/scene-wgpu'
crate: flighthq-scene-wgpu
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# scene-wgpu — Charter

## What it is

The WebGPU (WGSL) backend renderer for the 3D scene/mesh subject family — the per-backend leaf that turns a prepared `SceneNode` graph + `Camera` + `SceneLights` into draw calls. It carries the full catalogue of mesh-material shaders: a glTF-tier Cook-Torrance PBR uber-shader with its KHR extension lobes (clearcoat, sheen, anisotropy, iridescence, specular, subsurface, transmission/volume), the classic families (unlit, Blinn-Phong, Phong, Lambert, emissive), the NPR families (toon, matcap), and the debug families (vertex-color, normal, depth, wireframe).

It is the `scene-<backend>` leaf in the render layering: it sits over the `render-wgpu` core (state, targets, GPU plumbing) and the backend-agnostic `render` core (registration, queue, update pipeline), consumes types defined in `@flighthq/types` and packed in `@flighthq/render`, and renders the 3D subject `scene` / `mesh` / `lighting` / `texture` / `camera` produce. It ends where the GPU plumbing begins (`render-wgpu`) and where the deliberate twin `scene-gl` (WebGL/GLSL) covers the other GPU backend — the two are designed to mirror each other.

## North star (proposed)

- **A faithful per-backend leaf, not a renderer kitchen.** scene-wgpu translates an already-prepared scene into WGSL draw calls; it does not own the scene graph, the update pass, GPU device/target lifecycle, or post-processing/tonemap/resolve. Frame-finishing belongs to the effect pipeline above it. The package's job is correct, complete material translation for one backend.
- **Material depth is the package's center of gravity.** The shader catalogue is where this package is already close to authoritative; glTF-tier PBR fidelity (correct GGX/Smith/Fresnel, the standard maps, the KHR extension lobes) and a clean classic/NPR/debug family split are the bar to hold and extend.
- **An open material registry, never a closed switch.** Material dispatch is a kind-keyed `Map<Kind, …>` registry (`registerWgpuMeshMaterialRenderer` / `resolveWgpuMeshMaterialRenderer`) so the family stays tree-shakable and user-extensible — fork B's default. Registration is the opt-in seam; nothing registers at module top level.
- **Twin discipline with scene-gl.** scene-wgpu and scene-gl are deliberate twins. Cross-cutting lighting/shadow/IBL concerns are designed once in `@flighthq/types` and mirrored across both backends, so one backend's capabilities do not silently outrun the other's.
- **Greppable, types-first, allocation-explicit.** Full unabbreviated type words with the `Wgpu` infix for globally-unique exports; the compile/cache/key/source verb split; `out`-param writers; header types land in `@flighthq/types` before the backend consumes them; draw scratch is per-state runtime, not a module singleton.

## Boundaries (proposed)

**In scope (proposed):**

- WGSL translation and draw submission for the mesh-material catalogue (PBR uber-shader + extensions, classic, NPR, debug families).
- The per-backend plumbing a leaf renderer owns: pipeline/define-key caches, per-geometry upload caches with version invalidation, Frame/Draw/Material bind-group layouts, the transparent pass (blend pipeline variant + back-to-front sort).
- Consuming the shared forward-lighting / shadow / IBL **types** defined in `@flighthq/types` and the packers in `@flighthq/render`.

**Non-goals (proposed):**

- The scene graph, the prepare/update pass, and GPU device/target/surface lifecycle (owned by `scene`, `render`, and `render-wgpu` respectively).
- Post-processing, tonemap, MSAA resolve — the effect pipeline finishes the frame; this package does not produce a finished frame alone.
- Canvas2D / DOM backends (do not exist for the 3D family).
- Defining cross-package types inline — light-block, shadow, and IBL contracts belong in `@flighthq/types` first.

## Decisions

None blessed yet.

## Open directions

1. **Forward-light-count strategy — blocking the headline feature.** The multi-light forward infrastructure (WGSL helpers, GPU buffer, bind layout, per-frame upload) is built and tested but **dark**: every renderer hardcodes `pointLightCount: 0` / `spotLightCount: 0` / `hemisphereEnabled: false` into the define key, so the compile-time loops fold to nothing and no point/spot/hemisphere light renders. The unresolved fork: specialize a pipeline per live count bucket (max throughput, recompile on count change) vs. always compile `POINT_LIGHT_COUNT = 8` and guard with a runtime `if (pi < counts.x)` (no recompiles, up to 8 idle iterations). This decision gates whether multi-light rendering works at all.

2. **Is shipping dormant shader paths intended discipline or a smell?** The package currently ships reachable-only-after-a-deferred-decision WGSL (the forward-light loops, the inert `HAS_UV1` const with no second UV in `vs_main` and an unchanged 48-byte vertex stride). Is "infrastructure-first, built-but-dark" intended discipline, or a smell to close before the next pass? The charter should state the bar.

3. **Renderer-envelope scope and order.** The AAA bar for a 3D scene renderer is multi-light + shadows
   - IBL as table stakes. Which of shadows (depth pre-pass / atlas / PCF/VSM/CSM), IBL (cubemap / irradiance / prefiltered-env / BRDF LUT), skinning, instancing, and morph targets are in _this_ package's scope vs. a neighbor's — and in what order? Fork G accepts full 3D as in-scope SDK-wide; this package's slice needs naming.

4. **scene-gl ↔ scene-wgpu co-design obligation.** The two are deliberate twins. Shadow-map and IBL types should be designed once in `@flighthq/types` and mirrored. The charter should record the twin obligation so a future agent does not advance one backend's lighting without the other.

5. **uv1 / skinning vertex-layout change.** Extending the 48-byte stride (uv1 → 56; joints/weights → more) is a coordinated `@flighthq/mesh` + pipeline change. May scene-wgpu drive that change, or must it wait on a mesh-side decision?

6. **Public surface size.** The root barrel re-exports every prelude's key-builder, module-source getter, and pipeline compiler — a very wide surface for a leaf renderer where most consumers want only the `register*WgpuMaterial` functions + `drawWgpuScene`. Are the prelude internals public API (parity-tooling reach, small-functions philosophy) or implementation detail? Not a contract violation; a deliberate surface-size question.

7. **Transmission fidelity.** `transmissionVolumePbrWgpuMeshMaterialRenderer` uses a coverage/tint stand-in; true refraction needs an opaque-scene-color capture pass that does not exist. Is the approximation acceptable for this package's slice, or is the capture pass in scope?

8. **Stale `render-backend-support.md`.** The doc still says "wgpu blend modes = none" and "punctual lights unwired." Blend is now partially wired (premultiplied src-alpha transparent pipeline variant + back-to-front sort) and punctual-light infrastructure exists though dark. The doc should be updated to reflect both — leaving it flat understates transparency and overstates the lighting gap.
