---
package: '@flighthq/scene3d-formats'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - source
  - tests
  - types
  - charter
  - status
  - assessment
  - coverage
---

# scene3d-formats -- Review

**Domain:** 3D scene interchange codecs -- importing standard scene/mesh formats (glTF/GLB, OBJ/MTL,
AWD2, 3DS, MD2, MD5) into the format-neutral `Scene3DDocument`, then optionally assembling a live
`Scene3D`.

## Verdict

A genuine multi-format import library with broad coverage of six formats and deep glTF 2.0 support.
The package has matured from the single-function glTF stub of the 2026-07-03 review into a 26,584-line
codebase with 670 test cases across 22 test files. Every importer targets the shared
`Scene3DDocument` decomposition, which the `@flighthq/scene3d` assembler then turns into a live
scene -- the architecture is clean and the boundary is right. Diagnostics use the structured
`ImportDiagnostic` crumb system throughout with no free-text `warnings: string[]` remnants. The
extension handler system for glTF is individually importable and tree-shake-verified. The main gaps
are the absence of the charter-named USD format, some vertex-channel breadth within glTF (only
`TEXCOORD_0` is carried), and the lack of end-to-end rendering proof for any format beyond glTF and
AWD2 examples.

## Present capabilities

### Exported API surface

The public index exports 37 symbols; the contract lane adds `attachGltfPbrExtension` and
`findGltfPbrExtension` for intra-SDK use by extension handlers.

**Convenience wrappers** (bytes/string to `Scene3D`):

- `createScene3DFromGltf`, `createScene3DFromGlb` -- single default scene
- `createScene3DsFromGltf`, `createScene3DsFromGlb` -- all declared scenes
- `createScene3DFromObj`, `createScene3DFrom3ds`, `createScene3DFromAwd2`, `createScene3DFromMd2`,
  `createScene3DFromMd5Mesh`

**Document-level parsers** (to `Scene3DDocument`):

- `parseGltf`, `parseGlb`, `parseObj`, `parse3ds`, `parseAwd2`, `parseMd2`, `parseMd5Mesh`

**Supplementary**:

- `parseObjMaterialLibrary` -- MTL text to `ObjMaterialLibrary`
- `parseAwd2SkeletonAnimations` -- AWD2 bytes to a name-to-clip map bound to existing joints
- `parseMd5Anim` -- `.md5anim` text to `AnimationClip` bound to existing joints
- `importMd5Mesh` -- mesh + optional anim combined convenience
- `findScene3DSkeletonJoints` -- locates the skeleton's joints from a built scene
- `canonicalizeMd5TangentHandedness` -- resolves tangent.w from UV polarity
- Draco: `registerGltfDracoDecoder`, `unregisterGltfDracoDecoder`, `getGltfDracoDecoder`,
  `hasGltfDracoDecoder`
- 12 glTF extension handlers as individually importable constants

### glTF / GLB (deepest importer, 143 tests)

Core glTF 2.0: nodes, hierarchy, multi-scene, all seven primitive modes (line-loop and triangle-fan
expanded), sparse accessors, strided and normalized accessors, skins, morph targets with weights
animation (LINEAR/STEP/CUBICSPLINE), cameras (perspective including infinite far plane, orthographic),
multi-primitive meshes (each primitive is a child mesh node under a group), metallic-roughness PBR
materials with full factor and map support, alpha mode/cutoff, double-sidedness, and
`KHR_texture_transform`.

GLB container parsing validates magic, version 2, and chunk structure. External buffers are
caller-supplied through `GltfImportOptions.externalBuffers`. Embedded images (data URIs and
bufferView-backed) become unresolved `ImageResourceReference` values for
`@flighthq/scene3d-resources` to resolve.

`CORE_GLTF_EXTENSIONS` names `KHR_mesh_quantization` and `KHR_texture_transform` as intrinsically
satisfied by the reader. `KHR_texture_basisu` is read (the parser resolves the KTX2 source index) but
stays out of that set because the transcode is a resource-layer concern.

Extension handlers -- each tree-shakable, verified by `gltfTreeShaking.test.ts`:

| Handler | Extension | Behavior |
|---|---|---|
| `GltfPunctualLightsExtensionHandler` | `KHR_lights_punctual` | Directional/point/spot lights placed via node transforms |
| `GltfClearcoatExtensionHandler` | `KHR_materials_clearcoat` | Attaches PBR extension |
| `GltfSheenExtensionHandler` | `KHR_materials_sheen` | Attaches PBR extension |
| `GltfSpecularExtensionHandler` | `KHR_materials_specular` | Attaches PBR extension |
| `GltfIridescenceExtensionHandler` | `KHR_materials_iridescence` | Attaches PBR extension |
| `GltfAnisotropyExtensionHandler` | `KHR_materials_anisotropy` | Attaches PBR extension |
| `GltfEmissiveStrengthExtensionHandler` | `KHR_materials_emissive_strength` | Modifies standard/extended material in place |
| `GltfIorExtensionHandler` | `KHR_materials_ior` | Shared TransmissionVolume PBR descriptor |
| `GltfTransmissionExtensionHandler` | `KHR_materials_transmission` | Shared TransmissionVolume PBR descriptor |
| `GltfVolumeExtensionHandler` | `KHR_materials_volume` | Shared TransmissionVolume PBR descriptor |
| `GltfSpecularGlossinessExtensionHandler` | `KHR_materials_pbrSpecularGlossiness` | Replaces material with SpecularGlossinessPbrMaterial |
| `GltfUnlitExtensionHandler` | `KHR_materials_unlit` | Replaces material with UnlitMaterial |

Draco uses a separate registration seam (`registerGltfDracoDecoder`), not the handler interface,
because it decodes mesh geometry rather than modifying materials. The decoder contract is synchronous
(matches `parseGltf`), starts empty, and the extension is honestly unsupported until a decoder is
plugged in.

### OBJ / MTL (76 + 19 tests)

Vertices, normals, UVs, faces (triangles, quads, N-gon fan-triangulation), negative indices, `g`/`o`
grouping with per-`usemtl` subsets, `s` smoothing groups (implemented through the dedup key -- faces
in different groups cannot share a vertex, so computed normals respect boundaries), `l` polylines and
`p` points (separate sibling meshes with positions only). Generated normals and tangents when absent.
MTL reads both classic Blinn-Phong and the metallic-roughness PBR extension, selecting the material
model from what the file states.

### AWD2 (118 tests)

Triangle geometry with sub-meshes, streams (positions, indices, UVs, normals, tangents, joint
indices/weights), containers and mesh instances with hierarchy, skeletons, skeleton poses and
animations (decomposed into translation + rotation tracks), skinning (top-4 influence packing via
`packSkinInfluences`), materials (color, diffuse/normal/specular textures, specular tuning, alpha),
textures (embedded PNG/JPEG and external URLs), lights (point and directional, split into punctual +
ambient), cameras (perspective, orthographic, off-center orthographic), compressed bodies via the
`getDecompressor` seam (deflate, LZMA). LH-to-RH coordinate conversion with Z negation and winding
reversal throughout.

### 3DS (82 tests)

Named-object trimeshes, per-face material subsets, smoothing-group normals, `TRI_LOCAL` placement
(inverse-localized geometry with real node transform), materials (diffuse/specular/shininess/
transparency/opacity map), point and spot lights, cameras, keyframer pivots (geometry offset +
compensating node translation). Z-up-to-Y-up coordinate conversion.

### MD2 (47 tests)

Frame-based vertex animation as `MeshMorph` plus weights animation clip, compressed vertex
decompression via per-frame scale/translate, normals from the 162-entry Anorms LUT, UVs, skin names
as material external texture refs. Z-up-to-Y-up conversion plus winding reversal.

### MD5 (61 + 31 tests)

Skeleton hierarchy, multiple mesh sections with weighted vertex skinning (top-4 influences), bind-pose
vertex computation, joint transforms stored as parent-relative locals, shader names as material
diffuse maps. `.md5anim` parsing with per-frame per-joint 6-bit bitmask component selection. Z-up-to-
Y-up conversion for both positions and quaternions.

### Cross-cutting

- All importers produce `Scene3DDocument`, the shared decomposition that `createScene3DFromDocument`
  (from `@flighthq/scene3d`) assembles.
- Diagnostics uniformly use `reportImportDiagnostic` with structured crumbs (`kind`, `severity`,
  `origin`, `detail`). Repeated drops are coalesced via per-parser tally mechanisms. Zero
  free-text warnings remain.
- No exported types -- all types live in `@flighthq/types` (`Scene3DDocument`, `GltfDocument`,
  `GltfExtensionHandler`, `GltfImportOptions`, `ImportDiagnostic`, `ObjMaterialLibrary`, wire schemas
  for OBJ, MD5, 3DS, glTF).
- `sideEffects: false` declared. No top-level side effects. Draco decoder registry is the one piece
  of module-scoped mutable state, guarded behind explicit `register*`/`unregister*` verbs.
- Two-lane exports: `.` (index.ts, 37 public symbols) and `./contract` (contract.ts, adds
  `attachGltfPbrExtension` and `findGltfPbrExtension` for intra-SDK extension handler use).
- Coordinate-space conversion is explicit and shared: `convertPositionsZUpToYUp`,
  `convertQuaternionsZUpToYUp`, `convertTransformLhToRh`, `negateVec3Z`,
  `reverseTriangleWinding`/`reverseVertexTriangleWinding` in `shared.ts`, with comments naming which
  convention each importer converts from and why.

## Gaps

1. **Vertex channel breadth within glTF.** Only `TEXCOORD_0` is interleaved. `TEXCOORD_1`, `COLOR_0`,
   secondary `JOINTS_1`/`WEIGHTS_1` are not carried. A material declaring `texCoord: 1` now emits
   `gltf.texcoord-set-unsupported` (Recover) rather than silently sampling set 0, but the geometry
   data is still absent. Blocked on `@flighthq/mesh` gaining the missing two-component uint/unorm,
   unorm16, and quantized signed-normalized encodings.

2. **No USD importer.** The charter names USD as a long-term target and `description` once mentioned
   it; the `package.json` description now says "USD/OBJ later" but no code exists.

3. **No end-to-end rendering proof for most formats.** Only AWD2 (`awd2loading`) and glTF
   (`formatloading`) are exercised by examples. MD2, MD5, 3DS, and OBJ are reachable only via
   `@flighthq/scene3d-resources`. Non-indexed geometry repairs (AWD2 winding/normals/tangents and
   glTF flat-normal/tangent generation) are confirmed at parse level only -- no functional baseline
   covers non-indexed assets.

4. **MD5 `.md5anim` never verifies skeleton compatibility.** `md5AnimParse.ts:326` falls back to
   positional binding when a joint name is absent, so applying `body.md5anim` over `head.md5mesh`
   produces scrambled but non-empty output with no diagnostic.

5. **3DS keyframer hierarchy and animation tracks are unread.** Only pivots are imported. The
   `NODE_HDR` ambiguity and world-space `TRI_LOCAL` placement make this a design decision, not a
   simple omission.

6. **AWD2 method bodies are unwalked.** Materials with `numMethods > 0` import their base only.
   The entire reference corpus is `numMethods == 0`, so no test can verify the walk.

7. **AWD2 read integrity gaps.** No Adler-32 verification, header flags and version-minor unread,
   material properties 5/6/8/11/13/22 have no reader. `readAwdString` performs no bounds checking.

8. **`KHR_texture_transform` remains inline in the glTF core parser** rather than using the open
   extension handler seam. Moving it requires a per-textureInfo hook shape the current handler
   interface does not offer.

9. **No export/serialization direction.** All parsers are import-only. The charter's "should
   scene-formats also export glTF?" question is open.

10. **`as unknown as` casts are pervasive for material types.** Every parser casts its format-specific
    material (e.g. `createStandardPbrMaterial(...)`) through `as unknown as Material` and then
    `as unknown as MaterialLike` when pushing into the document table. This is a systematic pattern
    (~20 instances across 8 files) driven by the material type hierarchy -- `StandardPbrMaterial` is
    not assignable to `MaterialLike` without the cast. Not a correctness bug, but the double cast
    hides the constraint.

## Charter contradictions

- The charter says "USD, OBJ, and other mesh/scene exchange formats." OBJ is implemented; USD is
  absent with no timeline. The `package.json` description still reads "USD/OBJ later" but the
  package now covers six formats, none of which is USD.

- The charter says "mesh-formats is NOT a separate package" because mesh files carry scene structure.
  This is consistently honored -- all mesh formats live here.

- The charter's "comprehensive glTF 2.0 coverage" milestone is substantially met for core features.
  The remaining gaps (higher UV sets, `COLOR_0`, Draco without bundled decoder) are integration
  rather than parser gaps.

## Contract and docs fit

- **Two-lane exports**: implemented correctly. Public lane has 37 symbols; contract lane adds 2
  helpers for intra-SDK extension handler machinery. No stray subpath exports.

- **Types in `@flighthq/types`**: verified. Zero `export interface`, `export type`, or `export enum`
  in any non-test source file. All wire schemas (`GltfSchema`, `ObjSchema`, `Md5Schema`,
  `ThreeDsSchema`, `Md2Schema`), the `Scene3DDocument` family, `GltfExtensionHandler`,
  `GltfImportOptions`, and `ImportDiagnostic` live in `@flighthq/types`.

- **`sideEffects: false`**: declared and correct. The Draco decoder registry is module-scoped mutable
  state but requires explicit `registerGltfDracoDecoder` calls -- no top-level side effects.

- **Diagnostics inversion rule**: implemented. All parsers report through `reportImportDiagnostic`
  with structured crumbs. Explain/format text is separately importable via
  `@flighthq/importdiagnostics`. No parser emits human-readable strings.

- **Naming conventions**: `create*` for allocation, `parse*` for document-level parsing, `import*`
  for convenience composition. Function names include the full type name (`createScene3DFromGltf`,
  `parseAwd2SkeletonAnimations`). Extension handlers use `Gltf*ExtensionHandler` naming.

- **Allocation verbs**: `create*` allocates (`createScene3DFromGltf`, `createEmbeddedTextureRef`);
  parse functions write to fresh arrays/documents.

- **No `@flighthq/sdk` import**: verified.

- **Test colocality**: one test file per source file, colocated in `src/`, named `*.test.ts`. 670
  test cases across 22 test files.

- **Coverage doc**: `agents/scene3d-format-coverage.md` provides a durable per-format feature
  inventory verified against source. Status.md points to it.

## Candidate open directions

1. **Mesh encoding vocabulary** -- prerequisite for higher vertex channels. Once `@flighthq/mesh`
   gains the missing encodings, glTF can carry `TEXCOORD_1`, `COLOR_0`, and secondary skin
   influences without decoding everything to float.

2. **Per-textureInfo extension hook** -- would allow `KHR_texture_transform` to move out of the core
   parser and into the open handler seam, and would open the door for texture-level extensions like
   `KHR_texture_basisu` as a handler.

3. **Export/serialization** -- `createGltfFromScene3DDocument` or similar, making the package a
   round-trip codec. The `Scene3DDocument` decomposition already provides the natural input.

4. **USD/USDZ** -- charter-named long-term target. Scope question (full USD or Apple's USDZ subset)
   is open.

5. **End-to-end proof** -- functional baselines for non-indexed geometry, for formats without
   examples (MD2, MD5, 3DS, OBJ), and for the non-glTF material paths.

6. **MD5 skeleton compatibility check** -- a diagnostic when `.md5anim` joint names do not match
   `.md5mesh` joint names, or when the positional fallback is used.

7. **Draco/meshopt/KTX2 decoder composition** -- the seam exists for Draco; meshopt and KTX2
   transcode are similar integration points.
