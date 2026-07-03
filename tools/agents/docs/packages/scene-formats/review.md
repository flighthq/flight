---
package: '@flighthq/scene-formats'
status: stub
score: 18
updated: 2026-07-03
ingested:
  - source
  - tests
---

# scene-formats — Review

_Migrated from the 2026-07-03 depth-review generation (reviews/depth/scene-formats.md)._

**Domain:** 3D scene interchange codecs — importing (and eventually exporting) standard scene/mesh formats (glTF/GLB, and per the package description USD/OBJ later) into the `scene`/`mesh` node graph.

**Verdict:** stub — completeness 18/100

The package exports one function, `createSceneFromGltf(source, warnings?)`, plus the `Gltf*` wire-format interfaces it parses against. The source is candid about being a "proving slice": POSITION + optional NORMAL/TEXCOORD_0 + indices, first primitive only, embedded base64 buffers only, no materials. Measured against what "scene formats" means anywhere else — three.js `GLTFLoader`, `gltf-transform`, assimp — this is the first ~15% of one format in one direction, and the plural package name (`scene-formats`, "USD/OBJ later") promises a codec family that does not exist yet. The slice that exists is competently built: correct TRS-vs-matrix node transforms, hierarchy wiring through `addNodeChild`, accessor decoding across all five integer component types plus float, sentinel-plus-`warnings` degradation instead of throws, and a portable base64 decoder.

## Present capabilities

- `createSceneFromGltf(source: GltfDocument | string, warnings?: string[]): Scene` — parses glTF 2.0 JSON (string or object) into a `Scene`: node hierarchy with transforms (16-element `matrix` or TRS via `setSceneNodeTransform`), mesh nodes whose first primitive is interleaved into the canonical PBR vertex layout (position/normal/tangent/uv0, stride 48; tangents zero-filled), indices normalized to `Uint32Array`. Missing accessors/bufferViews degrade to empty geometry with a pushed warning rather than a throw — consistent with the sentinel rule. Root selection honors `doc.scene`/`doc.scenes` and falls back to computed top-level nodes.
- `gltfSchema.ts` — typed glTF 2.0 subset (`GltfDocument`, `GltfNode`, `GltfMesh`, `GltfPrimitive`, `GltfAccessor`, `GltfBufferView`, `GltfBuffer`, `GltfComponentType`) with spec-exact field names.
- Tests cover string-vs-object input, parent/child hierarchy, transform application, index/vertex counts, out-of-bounds accessor and missing bufferView warnings, and the empty document.

## Gaps vs an authoritative scene-formats library

Compare three.js `GLTFLoader`, `gltf-transform`, cgltf, and assimp. Within glTF alone, most of the format is unimplemented (the file's own comment lists several of these):

- **GLB (binary .glb) container** — the dominant distribution form of glTF; an importer without it fails on most real assets. Needs the 12-byte header + JSON/BIN chunk walk.
- **External buffer/image URIs** — only embedded base64 data URIs decode; `scene.bin` references need a resolver/fetch seam (an injected `(uri) => Promise<Uint8Array>` or integration with `@flighthq/loader`).
- **Materials and textures** — `GltfPrimitive.material` is typed but ignored. No `materials`/`textures`/`images`/`samplers` parsing, no mapping onto `@flighthq/materials` metallic-roughness (which exists and is the natural target). This is the single largest visible-output gap: every import renders untextured.
- **Interleaved bufferViews (`byteStride`)** — `readAccessor` assumes tight packing; a strided asset silently reads garbage. This is a correctness hole, not just a missing feature — at minimum it should warn.
- **Sparse accessors, `normalized` integer attributes** — typed (`normalized?`) but not honored; normalized UBYTE/USHORT colors/UVs decode wrong.
- **Multi-primitive meshes** — only `primitives[0]` imports; multi-material meshes silently drop geometry.
- **Attribute coverage** — no `TANGENT` (zero-filled instead of imported or generated via the `mesh` package's tangent tooling), no `COLOR_0`, `JOINTS_0`/`WEIGHTS_0`, `TEXCOORD_1`.
- **Animations and skins** — no `animations`, `skins`, or morph-target (`targets`/`weights`) parsing; no bridge to `@flighthq/timeline`/`tween`.
- **Cameras and lights** — `cameras` and `KHR_lights_punctual` are natural fits for the existing `camera`/`lighting` packages; absent.
- **Extensions machinery** — no `extensionsUsed`/`extensionsRequired` handling, not even to warn when a required extension is unsupported; no registry for extension handlers (the SDK's open-registry rule fits perfectly here).
- **Primitive `mode`** — typed but ignored; non-triangle modes (lines, strips, fans) import as if triangles.
- **Validation / version check** — `asset.version` is never checked; malformed JSON throws raw `JSON.parse` errors instead of a sentinel.
- **Export direction** — no `createGltfFromScene`/serializer; "formats" packages elsewhere in the SDK (`particles-formats`, `spritesheet-formats`) are import-export codecs.
- **Other formats** — OBJ (trivial, high value for test assets) and USD are named in the description but absent.

## Naming / API-shape notes

- `createSceneFromGltf` uses the `create*` allocation verb and names both the output type and the format — good, and consistent with the `*-formats` siblings' `parse*/serialize*` families. When export arrives, decide the pair vocabulary deliberately (`createSceneFromGltf`/`serializeSceneToGltf` or align with `parseParticleDesigner`-style naming used by the other formats packages).
- `createMesh(...) as unknown as SceneNode` is a double-cast smell at the heart of the importer; if `Mesh` is a `SceneNode` family member, the types should say so without `unknown`.
- `CANONICAL_LAYOUT`/`CANONICAL_FLOATS_PER_VERTEX` duplicate a constant the `mesh` package keeps private ("kept in sync structurally" per the comment). That is a drift trap — the canonical layout should be exported from `mesh` (or `types`) and imported here.
- The `Gltf*` interfaces are exported from the package barrel (`export * from './gltfSchema'`). They are format-internal wire types, not cross-package SDK types, so keeping them out of `@flighthq/types` is right; but consider whether exporting the whole schema publicly is intended surface or should narrow to `GltfDocument`.
- The hand-rolled `decodeBase64` is a portability duplicate waiting to happen — other packages (image, e.g. Base64 loading) plausibly need the same primitive; a shared home would follow the extract-the-missing-primitive rule.
- `warnings?: string[]` as an out-array is a reasonable sentinel-friendly diagnostics channel, but it is a convention invented here; if it spreads to other codecs it should be standardized (and typed) once.

## Recommendation

Treat as the seed of a real codec package, not a finished one. Priority order for reaching solid: (1) GLB container + external buffer resolver seam — without these it cannot open real-world assets; (2) `byteStride` de-striding and `normalized` handling — silent-corruption correctness holes; (3) materials/textures mapped onto `@flighthq/materials` + `@flighthq/texture`; (4) multi-primitive meshes and full attribute coverage (TANGENT, COLOR_0); (5) an extension-handler registry (open registry over closed switch, per the design constraints) with `KHR_lights_punctual` and `KHR_materials_*` as first entries; (6) animations/skins once `timeline` integration is designed. OBJ import is cheap and would justify the plural name early. Export can wait but should be named into the plan so the API pair is symmetric. The existing slice is well-shaped — grow it rather than restructure it.
