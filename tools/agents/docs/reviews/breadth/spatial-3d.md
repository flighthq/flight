# Breadth Review: 3D / Spatial Graphics Developer

**Lens:** I build 3D/spatial content and judge whether the SDK's scene graph, geometry, cameras, lighting, materials, textures, and GPU rendering cover what a mature 3D layer owes its users.

**Coverage** 62/100

## What a complete SDK owes this perspective

A developer reaching for the 3D side of an SDK expects a recognizable, end-to-end pipeline:

- A **3D scene graph** with hierarchical transforms (TRS / matrices), local↔world propagation, bounds, and visibility.
- **3D math**: Vector3/4, Matrix3/4, quaternions, planes, AABB/sphere, rays — with pooling and `out`-param hot paths.
- **Geometry**: indexed vertex buffers with standard attributes (position/normal/tangent/uv/color), primitive builders (box, sphere, plane, cylinder, cone, torus), and normal/tangent/bounds computation.
- **Cameras**: perspective + orthographic projections, look-at, view-projection, inverse VP for unprojection/picking.
- **Lights**: ambient, directional, point, spot, hemisphere, area, plus image-based/environment lighting.
- **Materials**: an unlit baseline, classic lit models (Lambert/Phong/Blinn-Phong), and a metallic-roughness **PBR** core with the common glTF extensions; plus debug materials (normal, depth, wireframe, vertex color) and stylized (toon, matcap).
- **Textures**: 2D textures, samplers (wrap/filter/mip/anisotropy), and **cubemaps** for skybox/IBL.
- **GPU rendering** across at least one modern backend, with frustum culling and an update→draw pass.
- The "second half" of a 3D engine: **asset import** (glTF/OBJ), **skeletal animation/skinning**, **shadows**, **picking/raycasting**, **instancing**, **render-to-texture / post-processing**, and a **skybox/IBL** realization.

## Well covered

The foundation and the shading layer are genuinely strong — well past the "doorway, road untaken" framing in the package map.

- **3D math is complete.** `@flighthq/geometry` ships `vector2/3/4`, `matrix3/matrix4`, `quaternion`, `plane`, `aabb`, `boundingSphere`, each with a matching `*Pool`. This is the correct, portable, allocation-explicit base a 3D layer needs.
- **Geometry builders are canonical.** `@flighthq/mesh` has box/sphere/plane/quad/cylinder/cone/torus builders with sensible defaults, plus `computeMeshGeometryNormals`/`Tangents`/`Bounds` and clone. Vertex semantics are a clean enum (`position/normal/tangent/uv0/uv1/color0/joints0/weights0`).
- **Cameras are real.** `@flighthq/camera` has perspective + orthographic projections, `setCameraViewMatrix4FromLookAt`, view-projection and **inverse** view-projection, and camera jitter (TAA-friendly). Inverse VP is present, which is the hook picking/unprojection would build on.
- **Lighting breadth is good.** Ambient, directional, point, spot, hemisphere, **and area** lights, plus an `Environment` (radiance cubemap + intensity) described as the IBL/skybox source.
- **Materials are the standout.** `@flighthq/materials` is a mature library: unlit, Lambert, Phong, Blinn-Phong, standard metallic-roughness PBR, and the glTF extension set (clearcoat, sheen, anisotropy, iridescence, transmission/volume, subsurface, specular, specular-glossiness), plus normal/depth/wireframe/vertex-color/emissive and toon + matcap. Both `scene-gl` and `scene-wgpu` register the full matching renderer set.
- **Textures cover the 3D needs.** `@flighthq/texture` has `Texture`, `Sampler`, and `CubeTexture` value types with clone/copy/equals — the cubemap primitive IBL and skybox require exists.
- **The render path exists on both modern backends.** `prepareSceneRender` + `drawGlScene`/`drawWgpuScene` over the `render-gl`/`render-wgpu` cores, and **frustum culling is implemented** (`render/sceneRender.ts` builds a frustum from the camera VP and `collectVisibleMeshes` culls against per-mesh world bounds).
- **It hangs together and is reachable.** All six 3D packages (`scene`, `mesh`, `camera`, `lighting`, `texture`, `materials`) are re-exported from `@flighthq/sdk`, and the Rust port mirrors the whole pipeline (`scene`, `mesh`, `lighting`, `texture`, `camera`, `scene-gl`, `scene-wgpu`).

## Gaps & missing capabilities

These are the parts of a mature 3D engine that are absent or stubbed. Most are whole subsystems, not polish.

- **No asset import.** There is no glTF/GLB or OBJ loader anywhere (`grep` for `parseGltf`/`loadGltf`/`parseObj` is empty). For a 3D developer this is the single largest gap: primitive builders cannot stand in for authored content. A PBR material library with no glTF importer is a shading engine without an asset pipeline.
- **No skeletal animation / skinning.** `joints0`/`weights0` are declared as "reserved semantics for a later skinning" in `MeshGeometry` but there is no skeleton, no joint/inverse-bind matrices, no skinning in the scene renderers, and no animation channels/samplers. Character content is out of reach.
- **No 3D animation system at all.** `@flighthq/timeline`/`@flighthq/tween` are 2D/display-object oriented; nothing drives node TRS, morph targets, or animation clips for the 3D graph. Even property animation of `SceneNode` transforms has no documented path.
- **No shadows.** No shadow maps, depth-from-light pass, or `castShadow`/`receiveShadow` concept. Lit scenes will render unshadowed.
- **No raycasting / picking.** No `raycast`/`intersectMesh`/`pickScene`. Inverse VP exists as a building block, but there is no ray-vs-mesh/AABB intersection or scene pick query — interaction with 3D content (selection, hover, gizmos) is unsupported, and `@flighthq/interaction` is 2D hit-testing only.
- **No GPU instancing.** "instance" hits in the renderers refer to GPU resources, not instanced draw of repeated meshes. Large counts of repeated geometry (foliage, particles-as-meshes, tiles) have no batched path.
- **IBL/skybox is declared but not evidently realized.** `Environment` carries a radiance cubemap and the PBR shaders have an env prelude, but there is no visible irradiance/prefilter/BRDF-LUT generation, no skybox draw entry point, and no cubemap-from-equirect/HDR loader. The data type is ahead of the runtime.
- **No post-processing pipeline for 3D.** `render` has a `renderTarget` and `camera` has a motion-blur effect, but there is no composable post chain (tone mapping/exposure, bloom wired to scene HDR, SSAO, FXAA/TAA-resolve). `setCameraJitter` hints at TAA with no resolve pass to consume it.
- **No environment/scene niceties:** no LOD, no fog, no morph targets, no decals, no spatial acceleration structure beyond per-node frustum cull (no BVH/octree), and no debug draw (gizmos, light/camera/bounds visualizers) for 3D.

## Missing or too-thin packages I would expect

- **`@flighthq/gltf` (and/or `model` / `model-formats`)** — glTF/GLB import (and ideally OBJ) producing `MeshGeometry` + `Material` + a `SceneNode` graph. Mirror the `spritesheet` / `particles-formats` split: a logical loader package plus a `-formats` parser. This is the highest-value missing package for this perspective.
- **`@flighthq/skeleton` (or `skinning`)** — skeleton/joint hierarchy, inverse-bind matrices, skinning palette, and the renderer wiring to consume `joints0`/`weights0`. Pairs with an animation package.
- **`@flighthq/animation` (3D clips)** — animation clips, channels, samplers, and an evaluator that drives `SceneNode` TRS / morph weights / skeleton poses. (The existing `timeline`/`tween` are 2D; this is a distinct concern.)
- **`@flighthq/shadow` (or shadow support inside `scene-*`)** — shadow-map render passes and the light/material flags to opt in.
- **`@flighthq/picking` (3D raycasting)** — ray construction from camera + screen point, ray-vs-AABB/sphere/triangle, and a `pickScene` query; the 3D counterpart to `@flighthq/interaction`.
- **`@flighthq/environment` realization (IBL)** — irradiance + prefiltered-specular + BRDF-LUT generation from a cubemap, equirect/HDR→cubemap conversion, and a skybox draw. The `Environment` type wants a runtime to back it.
- **`@flighthq/postprocess`** — a composable 3D post chain (tone mapping/exposure, bloom from HDR, SSAO, AA resolve) over the existing `renderTarget` primitive.
- **Instancing support** — either a `@flighthq/instancing` cell or instanced-draw paths inside `mesh` + `scene-gl`/`scene-wgpu`.

## Verdict

The 3D **front half** is markedly more mature than the SDK's own framing admits: complete 3D math, canonical primitive builders, real cameras with inverse VP, a full light set, a genuinely impressive PBR-plus-glTF-extensions material library, cubemap textures, frustum-culled rendering on both GL and WGPU, and clean SDK + Rust-port exposure. If your content is procedurally built meshes with PBR materials and static lighting, the pipeline already hangs together and is usable.

The **back half** — the parts that turn a renderer into a 3D engine — is largely absent: no asset import, no skinning, no 3D animation, no shadows, no picking, no instancing, and an IBL/skybox story that exists as data types ahead of a runtime. The reserved `joints0`/`weights0` semantics and the `Environment`/jitter hooks show the design anticipates these, but a 3D developer cannot ship character content, import authored models, or interact with the 3D scene today. Closing the gap is mostly about adding the loader/skinning/animation/shadow/picking subsystems on top of an already-solid foundation, not reworking what exists. Scored as a strong foundation with major subsystems still owed.
