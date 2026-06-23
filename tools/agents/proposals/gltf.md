---
id: gltf
title: '@flighthq/gltf'
type: new-package
target: gltf
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/gltf.md
  - tools/agents/docs/reviews/breadth/spatial-3d.md
depends_on: []
updated: 2026-06-23
---

## Summary

glTF 2.0 / GLB (and OBJ) import that turns a model file into Flight's own value types — `MeshGeometry` + `Material` + a `SceneNode` graph, with PBR materials, textures, skins, and animation clips — using the codebase's existing 3D primitives rather than a parallel object model.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable importer: load a static, textured PBR model from a single `.glb` and get a renderable `SceneNode` tree. The 20% that unblocks "import an authored model and see it."

Types first, in `@flighthq/types`:

- `ParsedModel`, `ParsedNode`, `ParsedMesh`, `ParsedPrimitive`, `ParsedMaterial`, `ParsedTextureRef`, `ParsedAccessor`, `ParsedBufferView` — the neutral intermediate produced by `model-formats` (plain data, no entity identity).
- `ImportedModel` — the import result: `{ root: SceneNode; geometries: readonly MeshGeometry[]; materials: readonly (Material | null)[]; textures: readonly Texture[]; }`.
- `GltfImportOptions` — `{ flipUv?; generateNormals?; generateTangents?; computeBounds?; }`.
- `GltfResourceBackend` — `{ resolveUri(uri, baseUri): Promise<ArrayBuffer> | null; decodeImage(buffer, mimeType): Promise<ImageSource> | null; }`.
- `ModelFormatKind` string kind identifiers: `GltfModelKind = 'Gltf'`, `GlbModelKind = 'Glb'`, `ObjModelKind = 'Obj'`.

`@flighthq/model-formats`:

- `parseGlb(buffer: ArrayBuffer): ParsedModel` — GLB container (binary chunk + embedded JSON).
- `parseGltf(json: string, options?): ParsedModel` — glTF JSON with embedded (data-URI) buffers; returns external-buffer _references_ for the import layer to resolve.
- `detectModelFormat(buffer): ModelFormatKind | null` — sniff GLB magic / JSON.
- Accessor decode helpers: `readParsedAccessorFloat32(out, parsed, accessorIndex)` and the integer-index variant, decoding `SCALAR/VEC2/VEC3/VEC4` over `BufferView` byte strides into typed arrays.

`@flighthq/gltf`:

- `importGltfDocument(parsed: Readonly<ParsedModel>, backend: Readonly<GltfResourceBackend>, options?): Promise<ImportedModel | null>` — the core entry; returns `null` on unsupported/empty input (sentinel, not throw).
- `loadGltfFromUrl(url: string, options?): Promise<ImportedModel | null>` — convenience over the registered backend + `parseGlb`/`parseGltf`.
- `loadGltfFromArrayBuffer(buffer: ArrayBuffer, baseUri?, options?): Promise<ImportedModel | null>`.
- `createWebGltfResourceBackend()`, `getGltfResourceBackend()`, `setGltfResourceBackend(backend)`.
- Geometry mapping: position/normal/uv0 → `MeshGeometry` via `createMeshGeometry`; triangles only; missing normals filled by `computeMeshGeometryNormals`; bounds via `computeMeshGeometryBounds`.
- Material mapping: glTF metallic-roughness `pbrMetallicRoughness` → `createStandardPbrMaterial`, with base-color factor/texture, metallic/roughness factors, and the default material for primitives with none.
- Node mapping: glTF node TRS (or matrix) → `SceneNode` transform; hierarchy built with the scene graph's `addNodeChild`; meshes attached via `createMesh`.

Effort: medium. Mostly plumbing onto existing primitives; the GLB/accessor decode is the bulk of the work.

### Silver

Competitive with a well-regarded glTF loader (three.js `GLTFLoader`-class coverage): the common professional cases, full PBR texture set, OBJ, and the _data_ for skinning and animation.

Additional types in `@flighthq/types`:

- `Skin`, `SkinJoint` — joint node references + inverse-bind matrices (`Matrix4` array). (The entity/runtime and the skinning _math_ live in a `@flighthq/skinning` neighbor; `gltf` only produces `Skin` data.)
- `AnimationClip`, `AnimationChannel`, `AnimationSampler`, `AnimationTargetPath` (`'translation' | 'rotation' | 'scale' | 'weights'`), `AnimationInterpolation` (`'step' | 'linear' | 'cubicspline'`) — the clip _data_ (evaluation lives in `@flighthq/animation`).
- `MorphTarget` and `MeshGeometryMorphTargets` (additions to the geometry options) for blend-shape data.
- `TextureTransform` (the `KHR_texture_transform` offset/rotation/scale) and per-texture `texCoord` (uv0/uv1) selection.
- `ParsedSkin`, `ParsedAnimation`, `ParsedAnimationChannel`, `ParsedAnimationSampler`, `ParsedCamera`, `ParsedImage` extensions to the neutral intermediate.

`@flighthq/model-formats`:

- `parseObj(text: string, options?): ParsedModel` and `parseMtl(text, options?): readonly ParsedMaterial[]` (the OBJ companion format).
- Full accessor coverage: sparse accessors, normalized integer attributes, `JOINTS_0`/`WEIGHTS_0`, `TANGENT`, `COLOR_0`, `TEXCOORD_1`, morph-target deltas.
- `serializeGlb(parsed: Readonly<ParsedModel>, existing?): ArrayBuffer` and `serializeGltf(...)` — round-trip (the `serialize*` + `existing?` merge pattern the other `-formats` packages already establish), enabling re-export and tooling.

`@flighthq/gltf`:

- Full PBR texture mapping: normal (+ `normalScale`), occlusion (+ `strength`), emissive (+ `emissiveStrength`), metallic-roughness, all with `KHR_texture_transform` and uv-set selection; samplers (`createSampler` with wrap/filter/mip from glTF sampler defs).
- `alphaMode` (`OPAQUE`/`MASK` with `alphaCutoff`/`BLEND`) and `doubleSided` mapped onto material/render flags.
- Skin import: `importGltfSkins(parsed, importedModel): readonly Skin[]` wiring `JOINTS_0`/`WEIGHTS_0` geometry attributes to joint hierarchies and inverse-bind matrices.
- Animation import: `importGltfAnimations(parsed): readonly AnimationClip[]` producing clip/channel/sampler data targeting imported `SceneNode`s, morph weights, and joints.
- Morph-target import into `MeshGeometry`.
- Multi-primitive meshes (one `Mesh` per primitive sharing a node), and multi-buffer / external-`.bin` resolution through the backend.
- Common `KHR_materials_*` extensions already in `@flighthq/materials`: `emissive_strength`, `clearcoat`, `sheen`, `transmission`, `volume`, `ior`, `specular`, `anisotropy`, `iridescence`, `unlit` (`KHR_materials_unlit` → `createUnlitMaterial`).
- `ModelImportSignals` via `enableGltfImportSignals(...)` — opt-in progress/asset-resolved/error signals for large multi-resource loads (mirrors the `enable*Signals` pattern).
- Sentinel discipline: unknown extensions skipped (not thrown); a primitive with an unsupported topology returns a `null` geometry slot.

Effort: large. OBJ + full extension/texture coverage + the skin/animation data extraction are each substantial; serialization is a bonus tier.

### Gold

Authoritative / AAA — the canonical glTF reference path for the SDK. Passes the glTF-Sample-Models corpus, handles every ratified extension Flight's materials support, is fast and allocation-disciplined, and has 1:1 Rust-port conformance.

Additional types in `@flighthq/types`:

- `DracoMeshCompression`, `MeshoptCompression` descriptors for `KHR_draco_mesh_compression` / `EXT_meshopt_compression`.
- `KtxTextureSource` and the `KHR_texture_basisu` reference (delegating compressed-texture decode to a `@flighthq/texture-formats` neighbor).
- `GltfVariantSet` for `KHR_materials_variants`.
- `GltfLightPunctual` mapping `KHR_lights_punctual` → `@flighthq/lighting` light descriptors.
- `ModelImportReport` — a structured result of skipped extensions / clamped values / fallback decisions for diagnostics (returned alongside `ImportedModel`, not thrown).

`@flighthq/model-formats`:

- Decompression seams: `registerModelMeshDecompressor(kind, decompressor)` over a swappable `MeshDecompressorBackend` for Draco/meshopt (the heavy wasm codecs stay out of the default bundle, opt-in like HarfBuzz), plus `createWebMeshoptDecompressorBackend()`.
- Strict + lenient parse modes; exhaustive accessor edge cases (interleaved buffer views, byte-aligned strides, big-endian guards, degenerate index ranges).
- Validation pass: `validateParsedModel(parsed): ModelImportReport` (asset version, required-extensions, accessor bounds) — informational, returns a report.

`@flighthq/gltf`:

- Every ratified extension that maps onto existing Flight features: `KHR_lights_punctual`, `KHR_materials_variants`, `KHR_texture_basisu` (via `texture-formats`), `KHR_draco_mesh_compression`, `EXT_meshopt_compression`, `EXT_mesh_gpu_instancing` (→ instanced draw data), `KHR_materials_dispersion`, `KHR_animation_pointer`.
- `importGltfCameras(parsed): readonly Camera[]` mapping glTF perspective/orthographic cameras to `@flighthq/camera`.
- Instancing: `EXT_mesh_gpu_instancing` → per-instance transform buffers consumable by an instanced scene-render path.
- Cubic-spline animation sampler evaluation fidelity (tangents), animation-pointer channels, and quaternion-shortest-path correctness.
- Performance: zero-copy typed-array views over the source buffer where stride allows; `out`-param accessor decode in hot loops; pooled scratch matrices for node TRS composition; lazy image decode (decode-on-first-use) so unreferenced textures cost nothing.
- Robust error/diagnostics surface: `ModelImportReport` for every import, partial-import recovery (a broken primitive does not fail the whole model), and clear sentinels for every expected failure.
- Full colocated test suites (one `*.test.ts` per source, alphabetized `describe`s mirroring exports), a functional-test scene importing a representative `.glb` rendered across `displayobject`/`scene` GL + WGPU with a screenshot baseline, and a parity/conformance cell so `rust:gltf` import is byte-checked against `ts:gltf` on the sample corpus.
- 1:1 Rust parity: `flighthq-gltf` + `flighthq-model-formats` cover the same extension set, with `model-formats` on the value-typed conformance path and the decompressor/codec seams mirrored (Rust-native Draco/meshopt/KTX backends behind cargo features).

Effort: very large, and explicitly cross-package — Gold depends on `@flighthq/skinning`, `@flighthq/animation`, `@flighthq/texture-formats`, and an instanced scene-render path existing. Those are neighbor work items to surface, not absorb.

## Boundaries

- **Parsing vs. importing.** Raw byte/JSON parsing and the neutral `ParsedModel` intermediate live in `@flighthq/model-formats`; only entity construction (mapping onto `MeshGeometry`/`Material`/`SceneNode`) lives in `@flighthq/gltf`. Same split as `spritesheet` / `spritesheet-formats`.
- **No new material or geometry types.** glTF maps onto the _existing_ `@flighthq/materials` and `@flighthq/mesh` types. If glTF needs a material feature Flight lacks, that feature is added to `@flighthq/materials` (its package), not invented here.
- **Skinning math and animation playback are neighbors.** `@flighthq/gltf` produces `Skin` and `AnimationClip` _data_; the skinning palette / joint-matrix computation belongs in `@flighthq/skinning`, and clip evaluation (driving `SceneNode` TRS / morph weights over time) belongs in `@flighthq/animation`. This package never advances a clock.
- **Image and compressed-texture decode are seams, not implementations.** Plain image decode delegates to `@flighthq/resources`; KTX2/Basis/Draco/meshopt decode delegate to `@flighthq/texture-formats` / a mesh-decompressor backend. The heavy wasm codecs stay off the default bundle (opt-in), preserving bundle-size discipline.
- **GPU upload stays in the renderers.** Importing yields CPU-side `MeshGeometry`/`Texture` value types; `ensureGlMeshUpload` / `ensureWgpuMeshUpload` and texture binding remain the renderers' job.
- **No file dialog / filesystem coupling.** URI resolution is the `GltfResourceBackend` seam; picking a file is `@flighthq/dialog`/`@flighthq/filesystem`'s job.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Should `ImportedModel` own its arrays, or register into a scene/asset cache?** Returning plain arrays is the value-typed, mixable choice, but a content-addressed `@flighthq/asset` cache (also flagged missing by asset-pipeline) would want dedup of shared textures/geometries across imports. Decide whether `gltf` is cache-aware or stays cache-agnostic with the cache wrapping it.
- **Where do `Skin` and `AnimationClip` types live** — `@flighthq/types` seeded by this work, or do they wait for `@flighthq/skinning` / `@flighthq/animation` to define them? The header-first rule says `@flighthq/types`; the open question is sequencing across the three packages so the importer is not blocked.
- **`KHR_materials_unlit` and unsupported-extension policy.** Skip-and-report (Gold's `ModelImportReport`) vs. a strict mode that returns `null`. Proposed default: lenient skip + report, strict opt-in.
- **OBJ scope.** Is OBJ + MTL a first-class Bronze/Silver target or a thin convenience? It lacks PBR, skins, and animation, so it exercises a strict subset; confirm it earns the parser surface vs. being a documented non-goal.
- **Draco/meshopt as a backend seam vs. a `model-formats-draco` sub-package.** Both fit house patterns (swappable backend like HarfBuzz, or a `-formats` neighbor). The wasm-bundle-cost argument favors a backend seam that is unregistered by default.
- **Instancing data shape.** `EXT_mesh_gpu_instancing` presumes an instanced scene-render path that does not yet exist; the per-instance transform buffer type should be co-designed with that future renderer rather than guessed here.
- **Rust async/`Send` seam.** `GltfResourceBackend.resolveUri` returns a future; per the Rust port's async/`Send` note, keep the seam native-clean (sync where native is sync) and let `host-web` bridge `!Send` fetch/OPFS internally.

## Agent brief

> Create `@flighthq/gltf` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
