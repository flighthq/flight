# Review Work Items

Findings from the examples and feature review session (2026-07-15). Five confirmed-in-scope work items identified from investigating claims about missing features. Each has a detailed brief below with scope, architecture, files, acceptance criteria, and effort estimates.

## Summary

| # | Work Item | Effort | Packages |
|---|-----------|--------|----------|
| 1 | [Legacy 3D format parsers](#1-legacy-3d-format-parsers) | Medium per format (Large for FBX) | `scene-formats` |
| 2 | [WebGPU punctual lights](#2-webgpu-punctual-lights) | Small-Medium | `scene-wgpu` |
| 3 | [3D particle system](#3-3d-particle-system) | Medium-Large (Phase 1) + Large (Phase 2) | `types`, `particles`, `particleemitter`, new `sceneparticles`, `scene-gl`, `scene-wgpu` |
| 4 | [Custom material shader seam](#4-custom-material-shader-seam) | Medium-Large | `types`, `materials`, `scene-gl`, `scene-wgpu` |
| 5 | [Feature discoverability index](#5-feature-discoverability-index) | Small | `AGENTS.md` |

Additionally: smoke test fix already committed (favicon 404), orphaned baselines need regeneration, `formatloading` example not yet built.

---


## 1. Legacy 3D Format Parsers

## Context

`@flighthq/scene-formats` currently implements glTF 2.0 JSON and GLB parsing (`createSceneFromGltf`, `createSceneFromGlb`). The charter names OBJ and USD as future targets; the user has expanded scope to include legacy formats (AWD, 3DS, MD5, MD2, FBX) under the "whole hardware store" directive. All parsers live in this package, not separate ones (charter Decision 2026-07-03: "mesh-formats is NOT a separate package").

Current package score: 46/100 (partial). The existing glTF parser is well-shaped: accessor decoding across all component types, strided/normalized attributes, GLB container, multi-primitive meshes, TRS+matrix transforms, sentinel-plus-warnings degradation. Materials/textures and animations are not imported yet (cross-package gaps, tracked in assessment).

## Scope

Six formats to add, in priority order. Each gets its own parse file + schema file, exports a `createSceneFrom{Format}` function, and returns a `Scene` node hierarchy through the same `@flighthq/scene` + `@flighthq/mesh` primitives the glTF parser uses.

### Priority 1: OBJ/MTL

**Format:** Wavefront OBJ — ASCII text, line-oriented (`v`, `vn`, `vt`, `f` directives). Material references via `mtllib`/`usemtl` pointing to a companion `.mtl` file. The most common legacy interchange format; nearly every 3D tool exports it.

**Files:**
- `objParse.ts` — `createSceneFromObj(source: string, materials?: ObjMaterialLibrary, warnings?: string[]): Scene`
- `objSchema.ts` — `ObjMaterialLibrary` (parsed MTL data: ambient/diffuse/specular colors, texture map names, Ns/d/illum)
- `mtlParse.ts` — `parseObjMaterialLibrary(source: string, warnings?: string[]): ObjMaterialLibrary`

**Key concerns:**
- OBJ uses face-indexed vertices where position/normal/uv indices are independent (`f v/vt/vn`); must re-index into the interleaved canonical layout.
- Faces can be quads or N-gons; triangulate during import (fan triangulation for convex faces).
- Groups (`g`) and objects (`o`) map to scene hierarchy nodes.
- `usemtl` splits geometry by material — each material group becomes a separate Mesh child, matching the glTF multi-primitive pattern.
- MTL parsing is separate because the MTL file is a distinct resource (may arrive separately via loader). The parser accepts pre-parsed materials as an optional parameter.
- No materials mapping to `@flighthq/materials` types initially (same cross-package gap as glTF); material names are preserved in warnings or as node metadata for future binding.
- Negative indices (relative to current vertex count) are valid OBJ and must be supported.

**Effort:** Medium — text parsing is straightforward, but face re-indexing and material-group splitting add real logic.

### Priority 2: 3DS (3D Studio)

**Format:** Autodesk 3DS — binary chunked format (little-endian). Chunk ID (uint16) + chunk length (uint32) + payload. Legacy but ubiquitous in asset libraries; many free model sites still distribute `.3ds` files.

**Files:**
- `threeDsParse.ts` — `createSceneFrom3ds(bytes: Readonly<Uint8Array>, warnings?: string[]): Scene`
- `threeDsSchema.ts` — chunk ID constants, material/mesh/keyframe descriptor interfaces

**Key concerns:**
- Binary chunk walker similar in spirit to GLB but with a recursive chunk tree (editor chunk 0x3D3D contains object/material/light sub-chunks).
- Vertices are float32 x/y/z; faces are uint16 triangle indices. Straightforward mapping to `MeshGeometry`.
- UV coordinates are per-vertex in a separate chunk, aligned 1:1 with the vertex array (no re-indexing needed, unlike OBJ).
- Materials are name-referenced; texture filenames are embedded as null-terminated strings.
- The format has a 65535-vertex-per-mesh limit (uint16 indices). Multiple mesh chunks are common; each becomes a Mesh scene node.
- Transformation matrix chunk (0x4D4E) provides the local transform.
- Coordinate system is Z-up; convert to Y-up on import (swap Y/Z, negate Z) to match Flight's convention.

**Effort:** Medium — binary parsing is mechanical but the chunk tree requires careful offset tracking and there are many chunk types to handle (meshes, materials, transforms, smoothing groups).

### Priority 3: FBX

**Format:** Autodesk FBX — both binary and ASCII variants. The dominant professional interchange format (Maya, Blender, Unity, Unreal all use it). Complex: node-property tree with typed arrays, connections graph, deformers, animation curves.

**Files:**
- `fbxParse.ts` — `createSceneFromFbx(source: string | Readonly<Uint8Array>, warnings?: string[]): Scene`
- `fbxSchema.ts` — FBX node tree types, property types, connection model

**Key concerns:**
- Two container formats: binary FBX (header magic `Kaydara FBX Binary  \0`, node records with property arrays) and ASCII FBX (text, semicolon-delimited properties). Binary is far more common; ASCII is a nice-to-have.
- The FBX object model uses a connections graph (`C:` records) linking geometry, models, materials, textures, and deformers. Resolving this graph is the hard part.
- Geometry is stored as `Vertices` (flat float64 array) + `PolygonVertexIndex` (int32, negative values mark polygon ends) — requires polygon extraction and triangulation.
- Normals, UVs, and colors use a `MappingInformationType` + `ReferenceInformationType` scheme (`ByPolygonVertex`/`ByVertex` x `Direct`/`IndexToDirect`) that determines how to index into the data arrays.
- Layer element indirection (normals/UVs can be per-polygon-vertex with their own index array).
- Coordinate system and axis conventions vary by exporter; FBX embeds axis metadata in `GlobalSettings`.
- FBX version differences (7.1 through 7.5+) change binary record sizes (version >= 7500 uses 64-bit offsets).
- Scope for initial implementation: binary FBX geometry + hierarchy + transforms. No animations, deformers, or blend shapes initially (same phasing as glTF).

**Effort:** Large — the most complex format in this set. The binary container, connections graph, and polygon-vertex indexing scheme each demand significant logic. ASCII FBX can be deferred.

### Priority 4: MD5 (Doom 3 / id Tech 4)

**Format:** id Software MD5 — ASCII text, two files: `.md5mesh` (bind-pose skeleton + weighted meshes) and `.md5anim` (skeletal animation). A clean, well-documented format popular in game development tutorials and indie assets.

**Files:**
- `md5Parse.ts` — `createSceneFromMd5Mesh(source: string, warnings?: string[]): Scene`
- `md5Schema.ts` — joint, weight, mesh, animation frame types

**Key concerns:**
- `.md5mesh` contains joints (name, parent index, position, orientation quaternion) and meshes (vertices with weight references, triangles, weights with joint index + bias + position).
- Vertices are computed from weighted joint positions at bind pose — the parser must compute final vertex positions by accumulating `joint.orientation * weight.position + joint.position` scaled by `weight.bias`.
- The quaternion's W component is computed from X/Y/Z (unit quaternion: `w = sqrt(1 - x^2 - y^2 - z^2)`).
- Triangles are explicit uint32 indices — direct mapping to `MeshGeometry`.
- `.md5anim` import can wait; geometry-only is the first pass.

**Effort:** Small-Medium — ASCII parsing is simple; the joint-weight vertex computation is the only non-trivial piece but it is well-specified.

### Priority 5: MD2 (Quake 2 / id Tech 2)

**Format:** id Software MD2 — binary, fixed header (68 bytes), per-frame vertex animation (no skeleton). Classic format from Quake 2 era; small, fast, well-documented.

**Files:**
- `md2Parse.ts` — `createSceneFromMd2(bytes: Readonly<Uint8Array>, warnings?: string[]): Scene`
- `md2Schema.ts` — header layout, frame vertex types, normal lookup table

**Key concerns:**
- Fixed binary header with offsets to frames, triangles, UVs, skins.
- Vertices are compressed: uint8 x/y/z + uint8 normal index (index into a fixed 162-entry lookup table of unit normals). Scale and translate per frame decompress to float.
- UV coordinates are stored separately as short integers scaled by skin width/height.
- Triangles reference vertex indices and UV indices independently (like OBJ) — requires re-indexing.
- Per-frame vertex positions support morph animation, but initial import can return only frame 0.
- The 162-entry Anorms normal lookup table is a fixed constant array.

**Effort:** Small — compact binary with a well-known fixed layout. The normal lookup table and vertex decompression are the only non-trivial pieces.

### Priority 6: AWD (Away3D)

**Format:** Away3D AWD — binary block-based format. Niche; primarily used in the Flash/Away3D ecosystem. Included for completeness ("the whole hardware store") given Flight's lineage.

**Files:**
- `awdParse.ts` — `createSceneFromAwd(bytes: Readonly<Uint8Array>, warnings?: string[]): Scene`
- `awdSchema.ts` — block type constants, attribute types

**Key concerns:**
- Binary container with a header (magic `AWD\0`, version, compression flag, body length) followed by typed blocks (block type uint8, block ID uint32, data).
- Geometry blocks contain sub-meshes with typed attribute streams (position float32x3, normal float32x3, uv float32x2, indices uint16).
- Supports optional LZMA/Deflate compression on the body — initial implementation can warn-and-skip compressed AWD files rather than bundling a decompression library.
- Scene hierarchy blocks reference geometry/material blocks by ID.
- Materials are flat (color + texture reference) — no PBR.

**Effort:** Small-Medium — the block structure is simple, but compression support and the block-reference graph add moderate complexity. Compressed-body support can be deferred.

## Architecture

### File pattern

Follow the established glTF pattern exactly:
- `{format}Parse.ts` — the parser function(s), all private helpers, constants at bottom
- `{format}Schema.ts` — wire-format types/interfaces (format-internal; only the public input shape re-exported from barrel)
- `{format}Parse.test.ts` — colocated tests

### Naming convention

Each format exports one primary parse function: `createSceneFrom{Format}(source, warnings?): Scene`

| Format | Function | Input type |
|--------|----------|------------|
| OBJ | `createSceneFromObj` | `string` |
| MTL | `parseObjMaterialLibrary` | `string` |
| 3DS | `createSceneFrom3ds` | `Readonly<Uint8Array>` |
| FBX | `createSceneFromFbx` | `string \| Readonly<Uint8Array>` |
| MD5 | `createSceneFromMd5Mesh` | `string` |
| MD2 | `createSceneFromMd2` | `Readonly<Uint8Array>` |
| AWD | `createSceneFromAwd` | `Readonly<Uint8Array>` |

Text formats take `string`; binary formats take `Readonly<Uint8Array>`. FBX takes both (binary and ASCII variants). All accept an optional `warnings?: string[]` out-array for sentinel-based degradation.

### Output shape

All parsers return `Scene` (from `@flighthq/scene`). Geometry is interleaved into the canonical PBR vertex layout (position/normal/tangent/uv0, stride 48) via `createMeshGeometry` from `@flighthq/mesh`. Node hierarchy uses `createSceneNode`, `createMesh`, `addNodeChild`, `setSceneNodeTransform` from `@flighthq/scene` and `@flighthq/node`. This is the exact same pipeline the glTF parser uses.

### Shared utilities

Several helpers in `gltfParse.ts` are format-agnostic and will be needed by other parsers:
- `decodeBase64` — already flagged for extraction (assessment backlog: "shared home")
- The `CANONICAL_LAYOUT` / `CANONICAL_FLOATS_PER_VERTEX` constants — already flagged for export from `@flighthq/mesh` or `@flighthq/types`

Extract these to a shared internal module (e.g. `shared.ts`) when the second parser lands, or promote them to `@flighthq/mesh` if appropriate. Do not duplicate them in each parser file.

### Barrel export

Each parser's public function and input-shape type are re-exported from `index.ts`. Wire-format schema types stay module-internal (same as the current `GltfDocument`-only re-export pattern).

### Dependencies

No new package dependencies. All parsers use the same dependency set as glTF: `@flighthq/mesh`, `@flighthq/node`, `@flighthq/scene`, `@flighthq/types`. No external parsing libraries — all format decoding is hand-written (portable, tree-shakable, C/C++ portable idiom).

## Acceptance criteria

For each format parser:
1. Parser function exists and returns a `Scene` with correct hierarchy and mesh geometry
2. Wire-format schema types are defined in a companion schema file
3. Colocated `.test.ts` file exists with tests covering:
   - Minimal valid input (single mesh, single material)
   - Hierarchy (parent-child relationships, transforms)
   - Multi-mesh / multi-object files
   - Malformed/missing data (sentinel return + warning, no throws)
   - Empty input
4. Public exports added to `index.ts` barrel
5. `npm run check` passes (typecheck, lint, format, order, exports, packages)
6. `npm run test --workspace=packages/scene-formats` passes

## Effort estimates

| Format | Effort | Rationale |
|--------|--------|-----------|
| OBJ/MTL | Medium | Text parsing simple, but face re-indexing, N-gon triangulation, material-group splitting, and negative indices add real logic |
| 3DS | Medium | Binary chunk tree is mechanical but requires careful offset management; many chunk types |
| FBX | Large | Most complex format — binary container + connections graph + polygon-vertex mapping scheme; ASCII variant deferred |
| MD5 | Small-Medium | Clean ASCII format; joint-weight vertex computation is the only non-trivial piece |
| MD2 | Small | Compact fixed-layout binary; normal lookup table and vertex decompression are straightforward |
| AWD | Small-Medium | Simple block structure; compression support deferred |

## Priority order

**OBJ > 3DS > FBX > MD5/MD2 > AWD**

Rationale:
1. **OBJ** — highest real-world usage frequency; the universal lowest-common-denominator format; nearly every 3D asset collection includes OBJ files. Cheap to implement and immediately justifies the plural "formats" package name (assessment item 3 calls this "cheap, high value for test assets").
2. **3DS** — second most common legacy format in free asset libraries and older game modding communities; binary parsing follows the same chunk-walking pattern already proven by GLB.
3. **FBX** — the dominant professional interchange format (Maya/Blender/Unity/Unreal), but complex enough to warrant third position. Covers the largest gap in professional workflows.
4. **MD5/MD2** — game-development heritage formats; well-documented, lightweight. MD5's skeletal data is a natural future bridge to `@flighthq/skeleton3d`. MD2's per-frame vertices are a bridge to morph animation. These can be done together as a batch.
5. **AWD** — niche format with a small user base (Away3D/Flash ecosystem). Included for completeness but lowest priority.

## Open questions

- **Coordinate system normalization:** 3DS is Z-up, FBX embeds axis metadata, MD2 is Z-up. Should each parser individually convert to Y-up, or should there be a shared coordinate-system conversion utility?
- **Material data:** All formats carry material information. Until the cross-package material/texture mapping gap is resolved (glTF assessment item 1), parsers should preserve material names/indices on mesh nodes (or as a side output) so they can be bound later without re-parsing.
- **Format auto-detection:** The charter mentions "format auto-detection" as in-scope. A `createSceneFromFile(bytes, filename?, warnings?)` dispatcher that sniffs magic bytes or file extension could unify all parsers behind one entry point. This is a follow-up, not a blocker for individual parsers.

---

## 2. WebGPU Punctual Lights

## Scope

Add point, spot, and hemisphere light consumption loops to the WGSL PBR shader in `wgpuPbrPrelude.ts`, and wire the packed light data through to the GPU uniform so the WebGPU backend reaches parity with GL for forward punctual lighting.

## Architecture

### What already works (no changes needed)

The entire data pipeline is complete:

- **Data descriptors**: `PointLight`, `SpotLight`, `HemisphereLight` types in `@flighthq/types`.
- **SceneLights**: carries `point?`, `spot?`, `hemisphere?` arrays alongside `ambient`/`directional`.
- **Packing**: `packSceneLightBlock` (`packages/render/src/sceneRender.ts`) packs up to `MAX_FORWARD_LIGHTS` (= 4) of each type into `SceneLightBlock.data`, a flat `Float32Array` with documented offsets/strides (`SCENE_LIGHT_POINT_OFFSET`, `SCENE_LIGHT_SPOT_OFFSET`, `SCENE_LIGHT_HEMISPHERE_OFFSET` in `@flighthq/types/SceneLightBlock.ts`).
- **Counts**: `SceneLightBlock.pointCount`, `.spotCount`, `.hemisphereCount` (0..4).
- **Version gating**: `SceneLightBlock.version` bumps only on actual data change.

### What is missing

Two things:

1. **Frame uniform expansion** (`packages/scene-wgpu/src/wgpuMeshPipeline.ts`): `writeWgpuFrameUniform` currently copies only directional + ambient (12 floats of light data, offsets 0..10) into a 192-byte Frame buffer. The punctual arrays (point: 8 floats/light x 4 = 32, spot: 16 floats/light x 4 = 64, hemisphere: 12 floats/light x 4 = 48, plus 3 count u32s) are packed in `SceneLightBlock.data` but never uploaded. The Frame uniform buffer and its WGSL `struct Frame` must grow to include these arrays and their counts.

2. **WGSL shader consumption** (`packages/scene-wgpu/src/wgpuPbrPrelude.ts`): The `PBR_WGSL_BODY` fragment shader only has a directional light block and an ambient/IBL block. It needs:
   - A `rangeWindow` helper (smooth inverse-square falloff -- mirrors the GL one).
   - A `shadePbrPunctual` helper that evaluates the full Cook-Torrance BRDF (including all enabled extension lobes) for a single light direction + attenuated radiance. The GL prelude already factors this into `shadePbrPunctual` -- the WGSL prelude currently inlines the directional BRDF and would need the same factoring.
   - Point light loop: surface-to-light vector, distance-squared attenuation via `rangeWindow`, call `shadePbrPunctual`.
   - Spot light loop: same as point plus cone falloff (`smoothstep` between inner/outer cosines).
   - Hemisphere light loop: sky/ground gradient blended by `dot(normal, up)`, AO-attenuated.

### Reference implementation

`packages/scene-gl/src/glPbrPrelude.ts` lines 350-530 have the complete GL implementation:

- `rangeWindow` (lines 351-355): smooth inverse-square range window.
- `shadePbrPunctual` (lines 363-419): full Cook-Torrance + extension lobes for one light direction. Takes N, V, tangent, bitangent, L, lightColor, f0, diffuseColor, roughness, metallic. Returns the light's linear radiance contribution.
- Point loop (lines 493-501): `for i in 0..pointCount`, compute toLight/dist2/lightDir/atten, call `shadePbrPunctual`.
- Spot loop (lines 504-513): same as point plus cone smoothstep from `u_spotLights[i*4+3].y/x`.
- Hemisphere loop (lines 525-530): `for i in 0..hemisphereCount`, sky/ground blend by `dot(normal, up)`.

The packed data layout is identical between GL and WGSL -- the same `SceneLightBlock.data` feeds both.

### Key differences between GL and WGSL approaches

- GL uses individual `uniform vec4` arrays uploaded via `gl.uniform4fv`. WGSL uses a single `var<uniform>` struct bound as a buffer. The punctual data must go into either the existing Frame uniform (expanding it) or a separate lights-only uniform buffer on the same bind group.
- GL's `MAX_FORWARD_LIGHTS` is injected via `#define`. WGSL has no preprocessor; use a `const MAX_FORWARD_LIGHTS : u32 = 4;` or hardcode the array sizes (the value is a compile-time constant = 4).
- WGSL arrays in uniforms must use `array<vec4f, N>` with a compile-time size, not a runtime count. The loop uses a runtime count to break early (`if (i >= pointCount) { break; }`).
- The PBR prelude's `struct Frame` appears in two places: `wgpuPbrPrelude.ts` (the PBR uber-shader) and `wgpuMeshPipeline.ts` (`WGPU_MESH_PRELUDE_WGSL`, the shared non-PBR prelude used by unlit/matcap/wireframe/etc). Both must agree on the Frame struct layout. Lighting-independent families ignore the light fields but must declare the same struct size for bind group compatibility.

### Recommended approach

**Option A (preferred): Separate Lights uniform buffer on group(0).** Add a second `@group(0) @binding(1)` buffer for the punctual light arrays + counts. This avoids inflating the Frame uniform for non-lit families (unlit/wireframe/matcap) and keeps the Frame struct stable. The lights buffer is bound from the same `SceneLightBlock.data` that already carries the packed arrays. Non-lit families bind a zero-sized or dummy lights buffer.

**Option B: Expand Frame uniform.** Add the point/spot/hemisphere arrays and counts directly into `struct Frame`. Simpler binding but inflates the per-frame upload for all families (192 bytes -> ~800+ bytes) even when no punctual lights are present and even for unlit shaders.

Decision: the implementer should check whether all families share a single Frame bind group layout. If yes, Option A is better. If the bind group layout is already per-family, Option B is simpler. Looking at the code: `ensureWgpuFrameBindGroup` creates one bind group layout with a single `buffer` entry at binding 0 -- expanding this to include a second binding is straightforward.

### Implementation steps

1. **Add a `Lights` WGSL struct** to both `wgpuPbrPrelude.ts` and `wgpuMeshPipeline.ts`:
   ```wgsl
   const MAX_FORWARD_LIGHTS : u32 = 4u;
   struct Lights {
     pointLights : array<vec4f, 8>,      // MAX_FORWARD_LIGHTS * 2
     spotLights : array<vec4f, 16>,       // MAX_FORWARD_LIGHTS * 4
     hemisphereLights : array<vec4f, 12>, // MAX_FORWARD_LIGHTS * 3
     pointCount : u32,
     spotCount : u32,
     hemisphereCount : u32,
   };
   @group(0) @binding(1) var<uniform> lights : Lights;
   ```

2. **Create and upload a lights uniform buffer** in `wgpuMeshPipeline.ts`:
   - Add `lightsBuffer: GPUBuffer | null` to `WgpuSceneRuntime`.
   - In `ensureWgpuFrameBindGroup`, expand the bind group layout to include binding 1 for the lights buffer.
   - In `writeWgpuFrameUniform`, copy `SceneLightBlock.data` (the punctual slice, offsets `SCENE_LIGHT_POINT_OFFSET` through end) plus the three count values into the lights buffer.

3. **Add WGSL helpers** to `wgpuPbrPrelude.ts`:
   - `rangeWindow(dist2, invSqrRange)` -- direct port of GL's version.
   - `shadePbrPunctual(N, V, T, B, L, lightColor, f0, diffuseColor, roughness, metallic)` -- factor the directional BRDF computation (currently inlined at lines 409-457) into a reusable function. This function evaluates GGX D/V/F, the extension lobes (anisotropy/sheen/clearcoat/subsurface), and returns the radiance contribution. The directional light block then calls this helper, followed by the shadow factor multiply.

4. **Add consumption loops** in `fs_main`:
   - After the directional light block (after line 458), add the point light loop, spot light loop, and hemisphere light loop, mirroring `glPbrPrelude.ts` lines 493-530.
   - Point: `for (var i = 0u; i < MAX_FORWARD_LIGHTS; i++) { if (i >= lights.pointCount) { break; } ... }`
   - Spot: same pattern with cone falloff.
   - Hemisphere: sky/ground blend, added to radiance with AO attenuation.

5. **Update `WGPU_MESH_PRELUDE_WGSL`** in `wgpuMeshPipeline.ts` to declare the same `Lights` struct and `@group(0) @binding(1)` binding (non-lit families will read an empty/zeroed buffer and never loop the arrays).

6. **Update `render-backend-support.md`**: Change gap #8 from "wired on gl, not wgpu" to "wired on gl and wgpu". Update the 3D capability matrix row for "Point / Spot / Hemisphere lights" to show both gl and wgpu as supported.

### Files to modify

| File | Change |
|------|--------|
| `packages/scene-wgpu/src/wgpuPbrPrelude.ts` | Add `rangeWindow`, `shadePbrPunctual` helpers; refactor directional block to use `shadePbrPunctual`; add point/spot/hemisphere loops in `fs_main`; add `Lights` struct + binding to `struct` declarations |
| `packages/scene-wgpu/src/wgpuMeshPipeline.ts` | Expand Frame bind group layout with lights buffer; upload punctual data + counts in `writeWgpuFrameUniform`; add `Lights` struct to `WGPU_MESH_PRELUDE_WGSL` |
| `packages/scene-wgpu/src/wgpuSceneRuntime.ts` | Add `lightsBuffer: GPUBuffer | null` field |
| `agents/render-backend-support.md` | Update gap #8 and 3D capability matrix |

### Files NOT to modify

| File | Reason |
|------|--------|
| `packages/render/src/sceneRender.ts` | Packing already complete |
| `packages/types/src/SceneLightBlock.ts` | Layout already defined |
| `packages/types/src/SceneLights.ts` | Data types already defined |
| `packages/lighting/src/*` | Data layer already complete |

## Acceptance criteria

1. The scene3d example renders with point and spot lights on the WebGPU backend (visually matches GL output).
2. All existing `scene-wgpu` tests pass (no regressions).
3. Extension lobes (clearcoat, sheen, anisotropy, subsurface, iridescence, specular) respond to punctual lights, not just directional -- same as GL.
4. `render-backend-support.md` gap #8 updated to reflect parity.
5. `npm run check` passes.

## Effort estimate

**Small-Medium.** The work is bounded shader plumbing with a complete reference implementation (the GL prelude). The data pipeline is done; the task is WGSL consumption and one new uniform buffer binding. Estimated scope:
- ~100 lines of new WGSL (helpers + loops).
- ~50 lines refactoring the directional block to use `shadePbrPunctual`.
- ~40 lines of TypeScript for the lights buffer creation/upload.
- ~10 lines of runtime type expansion.
- Documentation update.

No new packages, no new types, no public API changes.

---

## 3. 3D Particle System

## Background

The particle system today is purely 2D. The simulation core (`@flighthq/particles`) operates on 2D SoA buffers -- velocities are `[vx, vy]` per particle (stride 2), transforms are `[x, y, rotation, scale]` per particle (stride 4), and all forces/colliders compute in 2D (x, y only). The config (`ParticleEmitterConfig`) exposes `directionX`/`directionY`, `gravityX`/`gravityY`, and 2D spawn shapes (`point`, `circle`, `rect`). The scene-node integration (`@flighthq/particleemitter`) wraps the sim as a `ParticleEmitter` display object -- a 2D node in the display-object graph, not the 3D scene graph.

### Current Architecture Summary

**Sim state (`ParticleEmitterState`):** `velocities: Float32Array` at stride 2 (`[vx, vy]`), `lifetimes` at stride 2 (`[age, maxLife]`), `scales`, `rotationSpeeds`, `colorBirth`/`colorDeath` at stride 3. Position lives in the emitter node's `ParticleEmitterData.transforms` at stride 4 (`[x, y, rotation, scale]`).

**Forces (`ParticleForce` -- closed union):** `WindForce{x, y}`, `DragForce{strength}`, `AttractorForce{x, y, strength, radius?, falloff?}`, `VortexForce{x, y, strength, radius?, falloff?}`, `TurbulenceForce{strength, scale}`. The `accumulateForces` inner loop writes to a 2-element `[ax, ay]` scratch. The `applyParticleForces` function reads position from `data.transforms` at offsets `[tt, tt+1]` and velocity from `state.velocities` at offsets `[vt, vt+1]`.

**Colliders (`ParticleCollider` -- closed union):** `PlaneCollider{nx, ny, distance}`, `CircleCollider{x, y, radius, mode, restitution?, friction?}`, `RectangleCollider{x, y, width, height, mode, restitution?, friction?}`. The `resolveColliders` function uses a 4-element scratch `[px, py, vx, vy]`. Reflection operates on 2D normals.

**Scene-node integration (`@flighthq/particleemitter`):** `ParticleEmitter` extends `DisplayObject` (2D graph). `ParticleEmitterData` stores typed arrays: `transforms` (stride 4: x, y, rotation, scale), `alphas`, `colors` (stride 3), `ids`, `velocities` (stride 2). `updateParticleEmitter` handles spawn, age, compact, and position integration. `stepParticleEmitter` is the convenience wrapper: forces -> update -> collisions.

**3D scene graph (`@flighthq/scene`):** `SceneNode` is the 3D hierarchy node with a `localMatrix: Matrix4`. `Mesh` extends `SceneNode` with `geometry: MeshGeometry` and `materials`. Scene rendering uses `prepareSceneRender` + `drawGlScene`/`drawWgpuScene`, with per-material renderers registered via `GlMeshMaterialRenderer`. Meshes are drawn in opaque/blended passes.

---

## Phase 1 -- Sim Extension (3D support in `@flighthq/particles` + types)

### Goal

Extend the particle simulation to support a Z axis without breaking existing 2D usage. Z defaults to 0 everywhere; 2D emitters continue working identically. The sim remains headless and scene-graph-free.

### Config Changes (`ParticleEmitterConfig` in `@flighthq/types`)

Add the following fields, all defaulting to 0 (preserving 2D behavior):

```
directionZ: number           // defaults to 0
gravityZ: number             // defaults to 0
```

Extend `ParticleEmitterShape` to include 3D spawn shapes:

```
type ParticleEmitterShape = 'point' | 'circle' | 'rect' | 'sphere' | 'cone3d' | 'box';
```

Add shape parameters for the new shapes:

```
emitterDepth: number         // box depth (Z extent), defaults to 0
emitterConeAngle: number     // cone3d half-angle in radians, defaults to 0
```

### SoA Buffer Changes (`ParticleEmitterState` in `@flighthq/types`)

`velocities` changes from stride 2 to stride 3: `[vx, vy, vz]` per particle. This is a breaking change to the internal buffer layout but the public API (`createParticleEmitterState`, `ensureParticleEmitterStateCapacity`) hides the stride, so callers are unaffected.

Add `prevZ: number` to `ParticleEmitterState` (defaults to `NaN`, matching `prevX`/`prevY`).

### Force Changes (`ParticleForce` union in `@flighthq/types`)

Extend existing force types to include Z:

- `WindForce`: add `z: number` (defaults to 0)
- `AttractorForce`: add `z: number` (defaults to 0)
- `VortexForce`: add `z: number` (defaults to 0), add `axisX/axisY/axisZ` for 3D vortex axis (defaults to `[0, 0, 1]` -- spinning around Z, matching 2D behavior)
- `TurbulenceForce`: extend the value noise to 3D (add `z` seed dimension)
- `DragForce`: no change needed (scalar strength applies per-component)

The `accumulateForces` inner function changes from a 2-element to a 3-element accumulator `[ax, ay, az]`. The hot loop reads `posZ` from the new buffer offset.

### Collider Changes (`ParticleCollider` union in `@flighthq/types`)

Add new 3D collider types to the closed union:

- `SphereCollider{x, y, z, radius, mode, restitution?, friction?}` -- 3D analog of CircleCollider
- `PlaneCollider3D{nx, ny, nz, distance, restitution?, friction?}` -- or extend existing `PlaneCollider` with optional `nz` (defaults to 0, preserving 2D). Extending is cleaner: `PlaneCollider` gains `nz?: number`, and the resolver uses `nz ?? 0`. No new kind needed.

Decision point: extend existing `PlaneCollider` with optional `nz` vs. add `Plane3DCollider`. Recommendation: extend `PlaneCollider` (add `nz?: number`, defaults to 0). The 2D plane `{nx, ny, distance}` is already a degenerate 3D plane with `nz=0`. Adding `SphereCollider` as a new kind is correct since a sphere collider is genuinely distinct from a circle.

The `resolveColliders` scratch changes from 4-element `[px, py, vx, vy]` to 6-element `[px, py, pz, vx, vy, vz]`. The `reflect` function extends to 3D normals.

### Backward Compatibility Strategy

- All new Z fields default to 0. `createParticleEmitterState` initializes `prevZ: NaN`.
- `ensureParticleEmitterStateCapacity` grows `velocities` at stride 3 instead of stride 2. Existing emitters that never set Z will have `vz = 0` everywhere -- a zero-cost no-op in the integration loop.
- The stride change in `velocities` is internal to the sim. `ParticleEmitterData` (the render-facing buffer on the display-object node) keeps its own stride -- the particleemitter package decides what to mirror.
- Existing 2D `updateParticleEmitter` in `@flighthq/particleemitter` must be updated to read velocity at stride 3 from `state.velocities`. The Z component is ignored for 2D rendering but must be tracked.
- The `validateParticleEmitterConfig` and `normalizeParticleEmitterConfig` functions gain defaults for the new fields.

### Implementation Files

1. `packages/types/src/ParticleEmitterConfig.ts` -- add `directionZ`, `gravityZ`, `emitterDepth`, `emitterConeAngle`; extend `ParticleEmitterShape`.
2. `packages/types/src/ParticleEmitterState.ts` -- add `prevZ: number`.
3. `packages/types/src/WindForce.ts` -- add `z: number`.
4. `packages/types/src/AttractorForce.ts` -- add `z: number`.
5. `packages/types/src/VortexForce.ts` -- add `z: number`, `axisX?: number`, `axisY?: number`, `axisZ?: number`.
6. `packages/types/src/TurbulenceForce.ts` -- (no type change needed, noise extends internally).
7. `packages/types/src/PlaneCollider.ts` -- add `nz?: number`.
8. New: `packages/types/src/SphereCollider.ts` -- `SphereCollider{kind, x, y, z, radius, mode, restitution?, friction?}`.
9. `packages/types/src/ParticleCollider.ts` -- add `SphereCollider` to the union.
10. `packages/particles/src/particleEmitterState.ts` -- velocity stride 2 -> 3, add `prevZ`.
11. `packages/particles/src/applyParticleForces.ts` -- 3D accumulator, 3D wind/attractor/vortex/turbulence.
12. `packages/particles/src/applyParticleCollisions.ts` -- 6-element scratch, 3D plane resolve, new sphere resolve.
13. `packages/particles/src/particleEmitterConfig.ts` -- defaults for new config fields.
14. `packages/particles/src/validateParticleEmitterConfig.ts` -- validation for new fields.
15. `packages/particleemitter/src/updateParticleEmitter.ts` -- read velocity at stride 3, add Z to spawn/integration/gravity. The Z position can be stored in a new `ParticleEmitterData.positionsZ: Float32Array` (stride 1, separate from the stride-4 transforms which stay `[x, y, rotation, scale]`), or the transform stride can be widened to 5+ (`[x, y, z, rotation, scale]`). Recommendation: widen transforms to stride 5. The stride constant `PARTICLE_TRANSFORM_STRIDE` is already centralized in `particleEmitter.ts`.

### Tests

- Every existing 2D test must continue passing with identical numeric output (Z = 0 throughout).
- New tests for each 3D force type: `WindForce` with `z != 0`, `AttractorForce` at `(x, y, z)`, `VortexForce` with custom axis, `TurbulenceForce` 3D noise consistency.
- New tests for `SphereCollider` (contain/exclude modes).
- New tests for `PlaneCollider` with `nz != 0`.
- New tests for 3D spawn shapes: `sphere`, `cone3d`, `box`.
- Deterministic replay tests: same seed produces identical 3D buffers.

### Acceptance Criteria

- All existing 2D particle tests pass with identical numeric output.
- New 3D force, collider, and spawn-shape tests pass.
- `npm run check` passes.
- `npm run packages:check` passes.
- `npm run exports:check` passes.

### Effort Estimate

**Medium-Large.** The SoA stride change touches the hottest inner loops (forces, collisions, update). The type surface is straightforward but the velocity stride change from 2 to 3 ripples through every function that reads `state.velocities`. Careful indexing work. Approximately 15 source files + 15 test files touched.

---

## Phase 2 -- Scene Node Integration (`@flighthq/sceneparticles`)

### Goal

Create a new package that bridges the `@flighthq/particles` simulation to the 3D scene graph (`@flighthq/scene`), following the same sim/node decomposition as `particles`/`particleemitter` but for `SceneNode` instead of `DisplayObject`.

### Package Name

**`@flighthq/sceneparticles`** (no dash -- follows the codebase's smashed compound-word convention: `particleemitter`, `displayobject`, `textureatlas`, `bitmaptext`). The package owns a `SceneParticleSystem` scene node, the 3D analog of `ParticleEmitter` in the display-object world.

Alternative considered: `particles-scene`. Rejected because the `-subpackage` suffix pattern is for codec/format neighbors of the base package (like `particles-formats`), not for scene-graph integration layers.

### Node Design

`SceneParticleSystem` extends `SceneNode` (so it participates in the 3D hierarchy with `addNodeChild`). It carries:

```typescript
interface SceneParticleSystemData {
  particleCount: number;
  positions: Float32Array;     // [x, y, z] x capacity -- stride 3
  velocities: Float32Array;    // [vx, vy, vz] x capacity -- stride 3
  scales: Float32Array;        // [scale] x capacity -- stride 1
  rotations: Float32Array;     // [rotation] x capacity -- stride 1 (billboard spin)
  alphas: Float32Array;        // [alpha] x capacity -- stride 1
  colors: Float32Array;        // [r, g, b] x capacity -- stride 3
  ids: Uint16Array;            // region/texture id per particle
  atlas: TextureAtlas | null;
  worldSpace: boolean;
}
```

The data layout is similar to `ParticleEmitterData` but with 3D positions (stride 3) instead of the 2D transforms (stride 4/5). Scale and rotation are separate arrays rather than packed with position, since 3D particles may have different rotation semantics (billboard rotation around the view axis, not a 2D angle).

### Sim-to-Node Glue

`updateSceneParticleSystem(node, state, config, deltaTime, ...)` -- the 3D equivalent of `updateParticleEmitter`. Reads the sim's `state.velocities` (stride 3) and integrates 3D positions. The pattern is identical: age, compact dead, spawn new, integrate velocity + gravity, apply color/alpha/scale curves.

`stepSceneParticleSystem(node, state, config, dt, forces?, colliders?, ...)` -- convenience wrapper folding forces -> update -> collisions.

### Rendering Approach

The scene-node package itself does not render. Following the existing pattern (scene defines nodes, scene-gl/scene-wgpu draw them), rendering lives in new modules within `@flighthq/scene-gl` and `@flighthq/scene-wgpu`.

#### Architecture Decisions Needed

**1. Billboard vs. Mesh Rendering**

Two rendering modes are standard in 3D particle systems:

- **Billboard quads:** Each particle is a camera-facing textured quad. This is the default for most VFX (smoke, fire, sparks, magic). The vertex shader constructs the quad corners from the particle's world position + the camera's right/up vectors, applying per-particle scale and rotation.

- **Instanced meshes:** Each particle is a full 3D mesh (e.g., debris chunks, confetti, leaves). The vertex shader applies a per-instance model matrix built from the particle's position, rotation (now a full quaternion or Euler triple), and scale.

Recommendation: **Billboard quads as the primary (Phase 2a) path.** This covers 80%+ of particle use cases and is simpler. Instanced mesh rendering can follow as Phase 2b. The node data layout accommodates both -- billboard uses `rotation` as the Z-spin angle; mesh instances would use a `rotations3D: Float32Array` (stride 4, quaternion) allocated only when the render mode is mesh.

**2. GPU Instancing Approach**

For billboard quads: a single quad (4 vertices, 6 indices) drawn with `glDrawElementsInstanced` / `wgpu.renderPass.drawIndexed`, where per-instance data (position, scale, rotation, color, alpha, texCoords) comes from a dynamic vertex buffer updated each frame from the SoA arrays, or from a storage buffer / uniform buffer array.

Recommendation: **Dynamic interleaved instance buffer.** Each frame, pack per-particle data into a single `Float32Array` instance buffer and upload it. This is the simplest, most portable approach. A storage-buffer (SSBO/WebGPU storage) path can be added later for very large particle counts.

For instanced meshes: `glDrawElementsInstanced` with a per-instance model matrix in an instance buffer (16 floats per particle) or a per-instance TRS (10 floats: 3 pos + 4 quat + 3 scale).

**3. Sort Order for Transparency**

Particles are typically alpha-blended and must be drawn back-to-front for correct compositing. The sim produces sort keys (charter decision: "sort-key is the sim's job").

Options:
- **CPU sort by view-space depth.** Each frame, compute `dot(particleWorldPos, cameraForward)` for each particle, sort indices, and draw in that order. This is the standard approach for moderate particle counts (<10k).
- **Order-independent transparency (OIT).** Weighted blended OIT or depth-peeling. More complex, avoids sorting entirely. Suitable for high particle counts but adds render passes.

Recommendation: **CPU sort (Phase 2).** The sim already produces sorted index arrays. The scene-particle renderer reads the sort order and draws particles in that sequence. OIT can be explored later for high-count scenarios.

### Dependencies

`@flighthq/sceneparticles` depends on: `particles` (sim), `scene` (SceneNode), `geometry`, `node`, `types`.

It does NOT depend on: `displayobject`, `sprite`, `particleemitter` (those are the 2D path).

### Renderer Integration

New modules in existing renderer packages (not new packages):

- `packages/scene-gl/src/glSceneParticleSystemRenderer.ts` -- billboard quad renderer for GL. Registers via `registerGlSceneParticleSystemRenderer(state)`. Uses a shared quad VAO + per-instance buffer.
- `packages/scene-wgpu/src/wgpuSceneParticleSystemRenderer.ts` -- billboard quad renderer for WebGPU. Same pattern.

These follow the existing material-renderer registration pattern in scene-gl/scene-wgpu but for a new kind (`SceneParticleSystemKind`) rather than a material kind.

### Shader Design

Billboard vertex shader:
- Inputs: per-vertex quad corner offset ([-0.5, -0.5] to [0.5, 0.5]), per-instance position (vec3), scale (float), rotation (float), texCoords (vec4 for atlas region), color (vec4 rgba).
- Uniforms: viewProjection matrix, camera right/up vectors (extracted from view matrix inverse).
- Output: `gl_Position = viewProjection * vec4(worldPos + right * cornerX * scale + up * cornerY * scale, 1.0)` with billboard rotation applied.

Fragment shader:
- Texture sample from atlas, multiply by per-instance color, apply alpha.
- Additive or alpha-blended output (configurable via the particle system's blend mode setting).

### Implementation Files

1. `packages/types/src/SceneParticleSystem.ts` -- `SceneParticleSystemData`, `SceneParticleSystemRuntime`, `SceneParticleSystem`, `SceneParticleSystemKind`.
2. `packages/sceneparticles/src/sceneParticleSystem.ts` -- `createSceneParticleSystem`, `reserveSceneParticleSystem`, append/remove/compact/clear, bounds computation.
3. `packages/sceneparticles/src/updateSceneParticleSystem.ts` -- sim-to-node glue (age, spawn, integrate, color/alpha/scale curves in 3D).
4. `packages/sceneparticles/src/stepSceneParticleSystem.ts` -- convenience wrapper.
5. `packages/scene-gl/src/glSceneParticleSystemRenderer.ts` -- billboard quad GL renderer.
6. `packages/scene-wgpu/src/wgpuSceneParticleSystemRenderer.ts` -- billboard quad WebGPU renderer.
7. Shader files for billboard particle rendering (GL + WGPU).

### Tests

- Unit tests for all `sceneparticles` source files (create, reserve, append, remove, compact, clear, bounds, update, step).
- Integration test: create a scene with a `SceneParticleSystem`, step for N frames, verify particle positions in 3D.
- Deterministic test: same seed produces identical 3D output.

### Functional / Visual Tests

- A functional test scene (`functional/scenes/scene-particles/`) showing 3D particles in the scene graph, rendered on GL and WebGPU backends.
- Visual verification: particles spawn from a 3D emitter, move in 3D space, face the camera (billboard), fade out over lifetime.

### Acceptance Criteria

- Scene-particle node can be added to a 3D scene and renders on both GL and WebGPU.
- Billboard quads face the camera correctly from all viewing angles.
- Alpha sorting produces correct compositing order.
- Existing scene rendering (meshes, lights) is unaffected.
- `npm run check` passes.
- `npm run ci` passes.
- Functional test renders correctly on GL and WebGPU.

### Effort Estimate

**Large.** This involves a new package, new types, new shaders for two backends, and a functional test. The node/sim-glue pattern is well-established (copy from particleemitter) but the shader work and GPU instancing are substantial. Approximately 7 new source files + 7 test files + 2 shader pairs + 1 functional test.

---

## Summary

| Phase | Scope | Effort | Packages Touched |
|-------|-------|--------|-----------------|
| 1 | 3D sim extension | Medium-Large | `types`, `particles`, `particleemitter` |
| 2 | 3D scene node + rendering | Large | `types`, new `sceneparticles`, `scene-gl`, `scene-wgpu` |

### Open Design Questions

1. **Transform stride in `ParticleEmitterData`:** Widen from 4 to 5 (`[x, y, z, rotation, scale]`) or add a separate `positionsZ` array? Widening is cleaner but touches every stride constant and index calculation in `particleemitter`.

2. **Velocity stride in `ParticleEmitterState`:** Stride 2 -> 3 is a rippling internal change. An alternative is a separate `velocitiesZ: Float32Array` but that splits the hot loop and hurts cache locality.

3. **VortexForce 3D axis:** The 2D vortex spins in the XY plane (tangent = perpendicular to radial). The 3D extension needs an axis of rotation. Default `[0, 0, 1]` preserves 2D behavior. Should the axis be stored as `axisX/axisY/axisZ` (flat fields) or as a separate `Vector3Like`? Flat fields are consistent with the other force types.

4. **Billboard rotation in 3D:** A single `rotation: number` is a spin around the camera's forward axis (standard billboard). Some effects want axial billboards (e.g., rain streaks that align with velocity). This can be a per-system setting (`billboardMode: 'full' | 'axial' | 'none'`) on `SceneParticleSystemData`.

5. **Soft particles:** Screen-space depth comparison for fade-at-intersections. This requires the depth buffer as a shader input. Standard technique but adds a render-pass dependency. Defer to Phase 2b.

6. **GPU compute sim:** The charter mentions this as a future direction. The SoA buffer layout is already GPU-compatible. A `particles-compute` package could run the sim in a compute shader and write directly to the instance buffer, bypassing the CPU readback. Out of scope for this brief.

---

## 4. Custom Material Shader Seam

## Scope

Add a `CustomMaterial` kind that lets users supply their own shader source (GLSL for GL, WGSL for WebGPU) to render 3D meshes, with typed uniform declarations and texture bindings. This fills the gap between the fixed material taxonomy (`StandardPbrMaterial`, `UnlitMaterial`, `ToonMaterial`, etc.) and the post-process `CustomShaderEffect`. Users can define per-surface shading -- triplanar projection, dissolve, hologram, stylized toon variants, procedural surfaces -- without forking or extending the built-in material library.

## Current Architecture Summary

**Material data layer** (`@flighthq/materials`): Plain-data entities extending `SurfaceMaterial` (which extends `Material`). Each material kind is a string (`StandardPbrMaterialKind = 'StandardPbrMaterial'`). Materials carry scalars, packed colors, and `Texture` handles -- no shader source, no GPU resources.

**Material renderer registry** (`scene-gl`, `scene-wgpu`): A per-`GlRenderState`/`WgpuRenderState` map from `Kind -> GlMeshMaterialRenderer`/`WgpuMeshMaterialRenderer`. Each renderer implements `bind(state, material, lights, camera)` and `draw(state, proxy, geometry)`. Registration is opt-in via `register*GlMaterial(state)` / `register*WgpuMaterial(state)`.

**Uber-shader system**: The PBR path uses a single GLSL/WGSL uber-shader (`glPbrPrelude`/`wgpuPbrPrelude`) specialized per material via a `DefineKey` (feature flags). The define key is hashed into a program/pipeline cache key. Extension materials (clearcoat, sheen, anisotropy, etc.) add one flag each and bind their uniforms into the same uber-shader.

**Standalone material shaders**: Non-PBR materials (Unlit, Toon, Matcap, Normal, Depth, Wireframe, VertexColor) each have their own prelude (e.g., `glUnlitPrelude.ts`, `wgpuUnlitPrelude.ts`) with independent vertex+fragment source, their own program cache, and their own `GlMeshMaterialRenderer`/`WgpuMeshMaterialRenderer` implementation.

**Existing custom-shader precedent** (`CustomShaderEffect`): The post-process layer already supports user-authored fragment shaders via `registerGlCustomShaderSource(state, shaderKey, fragmentSource)`. A `CustomShaderEffect` descriptor references the key by name. The shader reads `u_texture0` and writes `o_color`, with a flat `uniforms: Record<string, number | number[]>` bag for float/vec values. This is fullscreen-pass-only (2D effect pipeline), not 3D geometry.

## Architecture Options

### Option A: Fully Standalone Shader

The user provides complete vertex + fragment source. The `CustomMaterial` entity carries shader source strings and a uniform bag. The custom material renderer compiles and caches the program, uploads uniforms, and draws the mesh geometry.

**How it works:**
- User registers shader source(s) under a `shaderKey` string (mirrors the `CustomShaderEffect` pattern).
- `CustomMaterial` references a `shaderKey` plus a `uniforms` bag and optional `textures` bag.
- A `customGlMeshMaterialRenderer` / `customWgpuMeshMaterialRenderer` is registered for `CustomMaterialKind`.
- On `bind`: look up the compiled program by key, compile on cache miss, set the view-projection and camera uniforms, then upload the material's custom uniforms and textures.
- On `draw`: set per-draw model/normal matrices and issue the draw call.

**Vertex contract**: The user's vertex shader receives the standard PBR vertex record (position, normal, tangent, uv0 at locations 0-3) and must write `gl_Position`. The draw path provides `u_viewProjection`, `u_model`, `u_normalMatrix` as built-in uniforms the shader may reference.

**Pros:** Maximum flexibility -- any shading model, any vertex manipulation. Familiar to engine users (Unity ShaderLab, Godot Shader, Three.js ShaderMaterial).
**Cons:** User must handle everything: lighting, shadows, normal mapping, IBL. No access to the PBR pipeline's light block or shadow maps unless the user manually declares and consumes them. Duplicates boilerplate.

### Option B: Fragment Injection into PBR Pipeline

The user provides a fragment function that plugs into the PBR pipeline at a defined hook point. The uber-shader calls the user's function to override specific surface parameters (albedo, normal, roughness, metallic, emissive, alpha) before the lighting pass runs.

**How it works:**
- The user registers a GLSL/WGSL function body under a `shaderKey`.
- The PBR prelude gains a `CUSTOM_SURFACE` define. When set, the shader calls a user-injected `void customSurface(inout SurfaceParams params, vec3 worldPosition, vec3 worldNormal, vec2 uv)` function after the standard texture sampling and before lighting.
- `SurfaceParams` is a struct: `{ vec3 albedo, float metallic, float roughness, vec3 normal, vec3 emissive, float alpha, float occlusion }`.
- The material entity carries the `shaderKey` plus custom uniforms. The custom uniforms are uploaded as additional uniforms after the standard PBR block.
- The user's function can read the standard varyings (`v_worldPosition`, `v_uv0`, etc.) and the standard PBR uniforms, plus their custom uniforms.

**Pros:** Full PBR lighting/shadows/IBL for free. Low boilerplate -- the user writes only the surface parameter override. Triplanar projection is just an albedo override; dissolve is an alpha override.
**Cons:** Limited to modifying surface parameters -- cannot change the lighting model, vertex position, or add new render passes. The injection point is a specific version of the shader that can break if the prelude evolves.

### Option C: Both Tiers (Recommended)

Offer both, as two separate material kinds:

1. **`CustomShaderMaterial`** (Option A): Full standalone shader. The user owns the entire vert+frag. The renderer provides geometry upload, per-draw matrices, and the view-projection/camera uniforms. Everything else is the user's responsibility.

2. **`CustomSurfaceMaterial`** (Option B): Fragment injection into the PBR pipeline. The user provides a `customSurface` function body that overrides surface parameters before lighting. Gets PBR lighting, shadows, and IBL for free.

This mirrors the three.js pattern (`ShaderMaterial` vs `MeshPhysicalMaterial` with `onBeforeCompile`) but with Flight's explicit-registration, plain-data design. The two kinds are independent -- no inheritance, no shared state beyond the same program-cache infrastructure.

## Detailed Design

### Type Definitions (`@flighthq/types`)

```typescript
// CustomShaderMaterial.ts
export interface CustomShaderMaterial extends SurfaceMaterial {
  readonly kind: 'CustomShaderMaterial';
  shaderKey: string;
  uniforms: Record<string, number | number[]> | null;
  textures: Record<string, Texture> | null;
}
export const CustomShaderMaterialKind = 'CustomShaderMaterial';

// CustomSurfaceMaterial.ts
export interface CustomSurfaceMaterial extends SurfaceMaterial {
  readonly kind: 'CustomSurfaceMaterial';
  shaderKey: string;
  // The standard PBR properties are the defaults before the custom function runs.
  standard: StandardPbrMaterialProperties;
  uniforms: Record<string, number | number[]> | null;
  textures: Record<string, Texture> | null;
}
export const CustomSurfaceMaterialKind = 'CustomSurfaceMaterial';
```

### Shader Source Registration

```typescript
// In scene-gl (mirrors the CustomShaderEffect pattern):
registerGlCustomMaterialShader(state, 'triplanar', {
  vertex: TRIPLANAR_VERTEX_GLSL,   // or null for the default vertex shader
  fragment: TRIPLANAR_FRAGMENT_GLSL,
});

// For CustomSurfaceMaterial (fragment injection):
registerGlCustomSurfaceFunction(state, 'dissolve', DISSOLVE_SURFACE_GLSL);
// The registered GLSL is the body of:
//   void customSurface(inout SurfaceParams params, vec3 worldPos, vec3 normal, vec2 uv) { ... }
```

The WGPU equivalents register WGSL source:
```typescript
registerWgpuCustomMaterialShader(state, 'triplanar', {
  module: TRIPLANAR_WGSL,
});

registerWgpuCustomSurfaceFunction(state, 'dissolve', DISSOLVE_SURFACE_WGSL);
```

### Program/Pipeline Caching

- **CustomShaderMaterial**: Cache key is `custom:${shaderKey}`. One compiled program per key per state.
- **CustomSurfaceMaterial**: Cache key is `pbr-custom:${standardDefineKey}:${shaderKey}`. The custom function body is appended to the PBR prelude before compile, behind the `CUSTOM_SURFACE` define. The standard PBR define key (map flags, alpha mode) is still part of the cache key, so different map configurations with the same custom function compile distinct variants.

### Uniform Upload

The `uniforms` bag uses the same dynamic upload path as `CustomShaderEffect`: iterate `Object.keys(uniforms)`, look up the location by name, and upload by component count (1/2/3/4 -> `uniform1f`/`uniform2fv`/`uniform3fv`/`uniform4fv`; longer arrays -> `uniform1fv`). Matrix uniforms are out of scope for the dynamic bag (as in `CustomShaderEffect`); users needing matrices should pre-decompose or use a dedicated material kind.

### Texture Binding

The `textures` bag maps user-chosen uniform names to `Texture` handles. The renderer assigns texture units starting after the standard PBR maps (units 0-4 are baseColor/normal/metallicRoughness/occlusion/emissive). Custom textures bind to units 5+ in name-sorted order so the assignment is deterministic. On WGPU, custom textures occupy additional bindings in the material bind group (group 2, bindings 7+).

### Registration Functions

```typescript
// scene-gl
export function registerCustomShaderGlMaterial(state: GlRenderState): void;
export function registerCustomSurfaceGlMaterial(state: GlRenderState): void;

// scene-wgpu
export function registerCustomShaderWgpuMaterial(state: WgpuRenderState): void;
export function registerCustomSurfaceWgpuMaterial(state: WgpuRenderState): void;
```

### Constructors (`@flighthq/materials`)

```typescript
export function createCustomShaderMaterial(opts?: Readonly<Partial<CustomShaderMaterial>>): CustomShaderMaterial;
export function createCustomSurfaceMaterial(opts?: Readonly<Partial<CustomSurfaceMaterial>>): CustomSurfaceMaterial;
```

## Design Questions

### 1. GL/WGPU Split: Two Shader Sources?

The user must provide separate GLSL and WGSL source for each backend they target. This is unavoidable -- GLSL 300 es and WGSL are different languages with different syntax, binding models, and preprocessor capabilities. The registration functions are backend-specific (`registerGlCustomMaterialShader` vs `registerWgpuCustomMaterialShader`), so a user targeting both backends registers both. The `CustomShaderMaterial` entity itself is backend-agnostic (it carries a `shaderKey`, not source); the source lives in the per-state registry.

**Alternative considered:** A single `ShaderSource` type with `glsl`/`wgsl` fields. Rejected because the registration is already per-state and per-backend, and bundling both languages into one object forces the user to write both even when targeting one backend. The key-based indirection keeps the material serializable.

### 2. Uniform Typing

The dynamic `Record<string, number | number[]>` bag matches the existing `CustomShaderEffect` pattern. It covers scalar, vec2, vec3, vec4, and float arrays. Matrices are excluded (need `uniformMatrix*` on GL, different struct layout on WGPU). Color values must be pre-unpacked to linear floats by the user (or we add a `colorUniforms: Record<string, number>` bag that auto-unpacks packed RGBA to linear vec4).

**Open question:** Should there be a typed uniform declaration (a `CustomMaterialUniformLayout`) that declares name, type, and default for each uniform? This would enable:
- Validation at registration time
- Editor/inspector tooling
- Auto-generation of the uniform block on WGPU
- Serialization round-trips

Recommendation: Start with the flat bag for P1. Add a typed layout as P2 if editor tooling demands it. The flat bag is proven by `CustomShaderEffect` and keeps the initial implementation small.

### 3. Texture Binding

Custom textures need a binding contract. On GL, texture units are assigned by the renderer after the standard maps. On WGPU, additional texture/sampler bindings must be declared in the bind group layout -- the user's shader must match. This is the hardest part of the WGPU implementation: the bind group layout is compiled into the pipeline, so the layout depends on how many custom textures the material declares.

**Proposed approach:** The registration function accepts a `textureSlots: string[]` listing the uniform/binding names in order. This fixes the bind group layout at registration time (not per-material-instance). All materials using the same `shaderKey` share the same layout. A material instance that does not bind all declared slots gets a 1x1 white fallback texture.

### 4. Interaction with the Feature-Flag System

For `CustomShaderMaterial` (standalone): The feature-flag system is bypassed entirely. The user's shader is compiled as-is; no defines are prepended.

For `CustomSurfaceMaterial` (PBR injection): The standard PBR define key (map flags, alpha mask, double-sided) still applies. An additional `CUSTOM_SURFACE` define is set, gating the call to the user's function. The user's function body is string-concatenated into the prelude before compile. The extension-lobe defines (clearcoat, sheen, etc.) are not combined with custom surface in P1 -- this avoids a combinatorial explosion in the program cache. If needed later, the custom function can read the extension uniforms directly.

### 5. Vertex Attribute Contract

Both material kinds receive the standard mesh vertex record: `a_position` (vec3, location 0), `a_normal` (vec3, location 1), `a_tangent` (vec4, location 2), `a_uv0` (vec2, location 3). `CustomShaderMaterial` may access additional attributes (color, uv1) if the mesh provides them -- the user declares them in their shader at known locations. `CustomSurfaceMaterial` uses the standard PBR vertex shader unchanged.

### 6. Error Handling

Missing shader key at draw time: the renderer logs once via `@flighthq/log` and skips the draw (sentinel behavior, not a throw). This matches `CustomShaderEffect`'s passthrough-on-missing-key approach, adapted for 3D (skip instead of passthrough, since there is no input image to copy).

Compile errors: Thrown at bind time (the first frame the material is drawn), same as the existing PBR compile path. The thrown error includes the shader info log. This is a programmer error (malformed shader source), not a runtime condition.

## Package Placement

- **Type definitions** (`CustomShaderMaterial`, `CustomSurfaceMaterial`, their kinds): `@flighthq/types`
- **Constructor functions** (`createCustomShaderMaterial`, `createCustomSurfaceMaterial`): `@flighthq/materials`
- **GL renderers and registration**: `@flighthq/scene-gl` (alongside the existing material renderers)
- **WGPU renderers and registration**: `@flighthq/scene-wgpu`

No new packages are needed. The feature slots naturally into the existing material renderer architecture.

## Acceptance Criteria

1. `CustomShaderMaterial` renders on GL with a user-provided GLSL vertex+fragment shader, receiving the standard mesh vertex record and per-draw matrices.
2. `CustomShaderMaterial` renders on WGPU with a user-provided WGSL module.
3. `CustomSurfaceMaterial` renders on GL using the PBR pipeline with a user-injected surface function that can override albedo, roughness, metallic, normal, emissive, and alpha.
4. `CustomSurfaceMaterial` renders on WGPU with the same PBR injection pattern.
5. Custom uniforms (scalar, vec2/3/4) upload correctly on both backends.
6. Custom textures bind correctly on both backends (at least 2 custom texture slots).
7. Shader compilation results are cached by key (no recompile per frame).
8. Missing shader key degrades gracefully (skip draw, log once).
9. Unit tests cover: material construction, define-key generation for `CustomSurfaceMaterial`, uniform upload, texture slot assignment, missing-key sentinel.
10. At least one functional test demonstrates a visible custom effect (e.g., dissolve, triplanar, or hologram) on both GL and WGPU.

## Effort Estimate

**Medium-Large.** Broken down:

- Types + constructors: Small (1-2 files each in types and materials)
- GL `CustomShaderMaterial` renderer: Medium (shader registry, compile/cache, uniform upload, texture binding, draw -- modeled on the unlit renderer + `CustomShaderEffect` uniform path)
- GL `CustomSurfaceMaterial` renderer: Medium (PBR prelude injection, `SurfaceParams` struct, custom define key extension, program cache key composition)
- WGPU `CustomShaderMaterial` renderer: Medium-Large (pipeline creation with dynamic bind group layouts for custom textures is the hardest single piece)
- WGPU `CustomSurfaceMaterial` renderer: Medium (mirrors the GL injection approach but with WGSL const-flag branching instead of `#ifdef`)
- Tests: Medium (unit tests for both material kinds on both backends, plus one functional test)
- Documentation/examples: Small (one example showing both material kinds)

Total: ~3-5 working sessions for a single agent, depending on WGPU bind-group-layout complexity.

## Implementation Order

1. Types and constructors (both material kinds)
2. GL `CustomShaderMaterial` renderer (full standalone shader path)
3. GL `CustomSurfaceMaterial` renderer (PBR injection path)
4. WGPU `CustomShaderMaterial` renderer
5. WGPU `CustomSurfaceMaterial` renderer
6. Functional test (dissolve effect on both backends)
7. Example (triplanar projection or hologram)

---

## 5. Feature Discoverability Index

This section maps common feature keywords to their implementing packages and backend support. Agents searching for a feature should find the relevant package here.

## Feature Lookup

| Feature | Package(s) | Backend | Notes |
| --- | --- | --- | --- |
| **Shadows** (directional) | `@flighthq/lighting` (descriptors), `scene-gl`, `scene-wgpu` (renderers) | gl, wgpu | Directional shadow maps with PCF; `ShadowConfig` on `DirectionalLight` |
| **Fog** | `@flighthq/effects` (`ScreenSpaceFogEffect`) | canvas, gl, wgpu | Post-process fog with color/near/far/density; applied as a render effect |
| **Ambient light** | `@flighthq/lighting` (`AmbientLight`), `SceneLights.ambient` | gl, wgpu | `createAmbientLight(color, intensity)` |
| **Directional light** | `@flighthq/lighting` (`DirectionalLight`) | gl, wgpu | Supports shadow config |
| **Point light** | `@flighthq/lighting` (`PointLight`), `SceneLights.point` | gl only | WebGPU gap: data pipeline done, WGSL consumer missing (gap #8) |
| **Spot light** | `@flighthq/lighting` (`SpotLight`), `SceneLights.spot` | gl only | Same WebGPU gap as point lights |
| **Hemisphere light** | `@flighthq/lighting` (`HemisphereLight`), `SceneLights.hemisphere` | gl only | Same WebGPU gap |
| **Area light** | `@flighthq/lighting` (`AreaLight`) | — | Descriptor exists; renderer not wired |
| **IBL / Environment maps** | `@flighthq/lighting` (`createEnvironment`), `@flighthq/texture` (`CubeTexture`) | gl, wgpu | PBR materials integrate `Environment` for image-based lighting |
| **Particles (2D)** | `@flighthq/particles` (sim), `@flighthq/particleemitter` (display node) | canvas, gl, wgpu | CPU simulation, display-object rendering |
| **Particles (3D)** | — | — | Not yet implemented; see 3D particles work brief |
| **Collision (2D)** | `@flighthq/collision` | n/a (headless) | SAT narrow-phase: circle/AABB/OBB/polygon/segment/point |
| **Broadphase** | `@flighthq/spatial` | n/a (headless) | Uniform-grid spatial index feeding collision |
| **Custom shaders (post-process)** | `@flighthq/effects` (`CustomShaderEffect`), `effects-gl`/`effects-wgpu` | gl, wgpu | User-authored fragment for fullscreen effects |
| **Custom shaders (material)** | — | — | Not yet implemented; see custom material shader work brief |
| **Bloom** | `@flighthq/effects` (`BloomEffect`) | canvas, gl, wgpu | Threshold + blur + composite |
| **Blur** | `@flighthq/effects` (`BlurEffect`) | canvas, gl, wgpu | Gaussian blur |
| **Vignette** | `@flighthq/effects` (`VignetteEffect`) | canvas, gl, wgpu | |
| **Tone mapping** | `@flighthq/effects` (`ToneMapEffect`) | canvas, gl, wgpu | ACES/Reinhard/etc. |
| **Drop shadow** | `@flighthq/effects` (composite recipe) | canvas, gl, wgpu | |
| **Glow** | `@flighthq/effects` (composite recipe) | canvas, gl, wgpu | Inner/outer |
| **Color adjustments** | `@flighthq/adjustments` | canvas, gl, wgpu | Color matrix fuse: brightness, contrast, saturation, hue |
| **Materials (PBR)** | `@flighthq/materials` (`StandardPbrMaterial`) | gl, wgpu | Metallic-roughness Cook-Torrance |
| **Materials (unlit)** | `@flighthq/materials` (`UnlitMaterial`) | gl, wgpu | |
| **Materials (toon)** | `@flighthq/materials` (`ToonMaterial`) | gl, wgpu | Cel-shaded NPR |
| **Text** | `@flighthq/text` | canvas, dom, gl, wgpu | TextLabel, RichText, NativeText |
| **Text (bitmap)** | `@flighthq/bitmaptext`, `@flighthq/bitmapfont` | canvas, gl, wgpu | |
| **Text input** | `@flighthq/textinput` | n/a (headless) | Caret model, selection, undo/redo |
| **Audio** | `@flighthq/audio` (descriptors), `@flighthq/media` (playback) | web | Web Audio mixer bus graph |
| **Video** | `@flighthq/video`, `@flighthq/displayobject` (VideoDisplay) | canvas, dom, gl, wgpu | |
| **Camera (2D)** | `@flighthq/camera2d` | n/a (headless) | Deadzone follow, parallax, zoom |
| **Camera (3D)** | `@flighthq/camera` | gl, wgpu | Perspective/orthographic, frustum, picking |
| **Tween** | `@flighthq/tween` | n/a (headless) | Duration-based property animation |
| **Spring** | `@flighthq/spring` | n/a (headless) | Damped-harmonic second-order |
| **Easing** | `@flighthq/easing` | n/a (headless) | Penner/CSS/shader timing curves |
| **Skeletal animation** | `@flighthq/skeleton3d`, `@flighthq/animation` | gl, wgpu | |
| **Spritesheet animation** | `@flighthq/spritesheet`, `@flighthq/movieclip` | canvas, gl, wgpu | |
| **Path / shapes** | `@flighthq/path`, `@flighthq/shape` | canvas, dom, gl, wgpu | |
| **Path booleans** | `@flighthq/path-boolean` | n/a (headless) | Union/intersect/difference/xor/offset |
| **Hit testing** | `@flighthq/interaction` | n/a (runtime) | |
| **Tilemap** | `@flighthq/sprite`, `@flighthq/tilemap-formats` | canvas, gl, wgpu | Tiled TMX/TMJ |
| **Asset loading** | `@flighthq/assets`, `@flighthq/loader` | n/a (runtime) | Ref-counted, concurrent |
| **glTF import** | `@flighthq/scene-formats` | n/a (parser) | JSON + GLB |
| **OBJ/3DS/FBX import** | — | — | Chartered but not yet implemented |
| **Flow / game states** | `@flighthq/flow` | n/a (headless) | Push/pop/replace screen-state stack |
| **Snapshot / undo** | `@flighthq/snapshot` | n/a (headless) | Deep-clone + restore + interpolate |
| **Input** | `@flighthq/input` | web | Keyboard/pointer/wheel/gamepad |
| **Accessibility** | `@flighthq/accessibility` | web | ARIA bridge for canvas UIs |
