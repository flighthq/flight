# New Package Spec: @flighthq/instancing

**Represents:** GPU instanced-draw support — per-instance attribute buffers, an `InstancedMesh` scene leaf, and instanced draw paths in `scene-gl`/`scene-wgpu` so crowds, foliage, tiles, and mesh-particles draw thousands of copies of one geometry in a single call.

**Requested by:** rendering-gpu, spatial-3d

## Fits

Instancing is a thin, value-typed layer that sits beside `@flighthq/mesh` and is realized by the GPU scene backends. It does not own geometry, materials, or the scene graph — it owns the _per-instance data stream_ and the contract the backends draw it with.

- **Types-first.** All shared shapes land in `@flighthq/types` (the header layer) before any implementation: `InstanceBuffer`, `InstanceAttribute`, `InstanceAttributeLayout`, `InstancedMesh`, `InstancedMeshRuntime`, plus the opaque per-backend upload brands `InstanceBufferGlData` / `InstanceBufferWgpuData`. These mirror the existing `VertexAttribute` / `MeshGeometry*` / `MeshGeometryRuntime` quartet in `MeshGeometry.ts` exactly, so an instance buffer is "a second, per-instance vertex stream" in the type system — no new vocabulary.
- **Logic package: `@flighthq/instancing`.** Backend-agnostic. Depends on `@flighthq/types`, `@flighthq/entity` (entity/runtime pair + version bump), `@flighthq/geometry` (Matrix4/Aabb for transform packing and merged bounds). Knows nothing about WebGL/WebGPU. Owns the `InstanceBuffer` data type, packers, capacity helpers, and the `InstancedMesh` scene leaf (it sits beside `Mesh` and shares the `SceneNode` trait family, so it depends on `@flighthq/scene` for the node trait the same way `Mesh` does — or the `InstancedMesh` node lives in `@flighthq/scene` itself and only the buffer/packers live here; see open questions).
- **Backend realization in existing crates, not a new one.** `scene-gl` gains a `drawGlInstancedMeshSubset` (`ANGLE_instanced_arrays` is core in WebGL2 — `drawElementsInstanced`/`vertexAttribDivisor`), `scene-wgpu` gains `drawWgpuInstancedMeshSubset` (`draw_indexed` with `instance_count`). This matches the established `<subject>-<backend>` layering — instancing is a draw _mode_ of the mesh subject, not a new subject. No Canvas2D/DOM path (no instancing substrate there; consistent with `displayobject-canvas` being host-web only).
- **No `*Backend` seam.** Instancing is pure GPU plumbing inside backends that already own their state, not a swappable platform capability, so it gets no `get*/set*/createWeb*Backend` trio. The seam is the existing renderer registry (`registerGlMeshMaterialRenderer` style) — instanced draw reuses the registered material renderers, only changing the draw call.
- **Neighbor packages.** `@flighthq/mesh` (geometry it instances), `@flighthq/scene` (the node hierarchy), `@flighthq/scene-gl`/`scene-wgpu` (draw), `@flighthq/particles` (a future mesh-particle emitter that writes into an `InstanceBuffer`), `@flighthq/camera`/frustum-cull (per-instance culling). A future GPU-readback or indirect-draw concern is its own thing, not here.
- **Rust mirror:** `flighthq-instancing` (value types + packers), with `draw_gl_instanced_mesh_subset` in `scene-gl` and `draw_wgpu_instanced_mesh_subset` in `scene-wgpu`. `InstanceBuffer` is a plain interleaved byte buffer + layout, so it is a clean value-typed leaf — mixable (wasm drop-in) like `surface`/`geometry`.

## Bronze

The minimum that makes "draw 5,000 copies of one mesh in one call" real. Per-instance model matrix + color, one interleaved instance buffer, both GPU backends.

Types (`@flighthq/types` first):

- `InstanceAttribute` — `{ semantic: InstanceSemantic; format: VertexFormat; byteOffset: number }`, reusing the existing `VertexFormat` union.
- `InstanceSemantic` — string union seeded with `'modelMatrix0' | 'modelMatrix1' | 'modelMatrix2' | 'modelMatrix3' | 'instanceColor'` (a mat4 occupies four vec4 attribute slots, the canonical GL/WGPU encoding). Open contract, not closed — vendor-prefixed custom semantics allowed.
- `InstanceAttributeLayout` — `{ stride: number; attributes: readonly InstanceAttribute[] }`, twin of `VertexAttributeLayout`.
- `InstanceBuffer extends Entity` — `{ layout; data: Float32Array<ArrayBuffer>; capacity: number; count: number; version: number }`. `data` is the interleaved per-instance record stream; `count` is live instances, `capacity` is allocated slots; `version` bumps on edit so backends re-upload (mirrors `MeshGeometry.version`).
- `InstanceBufferRuntime extends EntityRuntime` — `{ webglData: InstanceBufferGlData | null; webgpuData: InstanceBufferWgpuData | null }`, plus the two opaque brand interfaces.
- `InstancedMesh extends SceneNode` — `{ geometry: MeshGeometry; materials: (Material | null)[]; instances: InstanceBuffer }`. `InstancedMeshRuntime`, `InstancedMeshKind = 'InstancedMesh'`.

Functions (`@flighthq/instancing`):

- `createInstanceBuffer(layout, capacity)` / `createInstancedMatrixColorBuffer(capacity)` — allocate the canonical mat4+color layout with sensible defaults.
- `createInstancedMesh(geometry, materials, instances, kind?, obj?)` — the leaf constructor, twinning `createMesh`.
- `setInstanceTransform(buffer, index, matrix4)` — write one instance's model matrix (out-style: writes into `buffer.data`, bumps `version`).
- `setInstanceColor(buffer, index, rgba)` — packed `0xRRGGBBAA` color, one convention.
- `getInstanceTransform(out, buffer, index)` / `getInstanceColor(buffer, index)`.
- `setInstanceBufferCount(buffer, count)` — set how many instances draw this frame.
- `getInstanceBufferCapacity(buffer)` / `getInstanceBufferCount(buffer)`.
- `destroyInstanceBufferGlData(buffer)` / `destroyInstanceBufferWgpuData(buffer)` — free GPU uploads (twins of `destroyMeshGeometryGlData`).
- `isInstancedMesh(source)`.

Backend draw paths:

- `scene-gl`: `ensureGlInstanceBufferUpload(state, buffer)`, `drawGlInstancedMeshSubset(state, program, proxy, geometry, buffer)` using `vertexAttribDivisor` + `drawElementsInstanced`.
- `scene-wgpu`: `ensureWgpuInstanceBufferUpload(state, buffer)`, `drawWgpuInstancedMeshSubset(state, proxy, geometry, buffer)` adding a per-instance `GPUVertexBufferLayout` (`stepMode: 'instance'`) and `draw_indexed(..., instance_count)`.
- The instanced pipeline/program variant: the existing mesh material renderers compile a second pipeline whose vertex stage reads the instance stream; `registerGlInstancedMeshMaterialRenderer` style registration parallel to the non-instanced one, or a flag on the existing one (see open questions).

Effort: medium. The hard part is one extra vertex-buffer binding with an instance divisor and a shader-input variant; the data layer is a near-copy of the existing mesh-geometry quartet.

## Silver

Competitive with what a good engine offers: ergonomic bulk editing, per-instance culling, growth, and dynamic-vs-static upload hints.

Types:

- `InstanceUpdateHint` — `'static' | 'dynamic' | 'stream'` on `InstanceBuffer`, mapped to GL `STATIC_DRAW`/`DYNAMIC_DRAW`/`STREAM_DRAW` and WGPU usage flags.
- `InstanceDirtyRange` — `{ first: number; count: number }` so a backend can `bufferSubData` only the touched slots instead of re-uploading the whole stream on every `version` bump.
- Add `'instanceUv'` (atlas/texture-frame offset) and `'instanceCustom0..3'` to the `InstanceSemantic` seed for per-instance UV/parameter variation.

Functions:

- `setInstanceTransformFromTRS(buffer, index, position, rotationQuaternion, scale)` — pack TRS without the caller building a Matrix4.
- `setInstanceBufferTransforms(buffer, matrices, offset?)` — bulk write a contiguous run.
- `growInstanceBuffer(buffer, minCapacity)` — geometric-growth reallocation (twins the typed-array capacity helpers in `@flighthq/geometry`); returns whether a realloc happened.
- `appendInstance(buffer)` — return the next free index, growing if needed; `removeInstanceBySwap(buffer, index)` — O(1) swap-remove that keeps the live range packed.
- `markInstanceBufferDirty(buffer, first, count)` / `getInstanceBufferDirtyRange(buffer)` / `clearInstanceBufferDirtyRange(buffer)` — partial-upload bracket consumed by the backends.
- `computeInstancedMeshWorldBounds(out, mesh)` — merged AABB over geometry bounds × every instance transform (for the scene frustum cull to treat the whole instanced node).
- `cullInstanceBuffer(out, buffer, geometryBounds, frustum)` — write a compacted/visible instance list (CPU per-instance frustum cull) into an `out` index list or compacted buffer, returning the visible count; the most-requested correctness feature for foliage/crowds.
- Backend partial upload: `ensureGlInstanceBufferUpload`/`ensureWgpuInstanceBufferUpload` honor the dirty range and update hint.
- Pool: `acquireInstanceBuffer(layout, capacity)` / `releaseInstanceBuffer(buffer)` for per-frame transient instance sets (mesh-particles), paired bracket.

Signals (opt-in group, lives here as the owner):

- `enableInstanceBufferSignals(buffer)` → growth/realloc notification for systems holding cached GPU handles.

Effort: medium. Cull + swap-remove + partial upload are the substance; each is self-contained.

## Gold

Authoritative: indirect/multi-draw, GPU-side culling hooks, mesh-particle integration, sorting, LOD selection per instance, exhaustive cross-backend parity tests, and 1:1 Rust conformance.

Types:

- `InstanceLodSet` — `{ geometries: readonly MeshGeometry[]; distances: readonly number[] }` and an `InstancedLodMesh extends SceneNode` so one instance pool can resolve to different geometries by camera distance.
- `IndirectDrawCommand` — `{ indexCount; instanceCount; firstIndex; baseVertex; firstInstance }` value record, the canonical indirect-args layout for WGPU `draw_indexed_indirect` / GL `multiDrawElementsIndirect` where available.
- `InstanceSortMode` — `'none' | 'frontToBack' | 'backToFront'` for transparent instanced draw correctness.

Functions:

- `sortInstanceBuffer(buffer, mode, cameraPosition)` — reorder live instances by depth into the buffer's draw order (for alpha-blended instances).
- `selectInstanceLod(out, lodMesh, cameraPosition)` — bucket instances into per-LOD index lists.
- `buildInstancedDrawCommands(out, instancedMesh)` / `buildIndirectDrawBuffer(...)` — produce `IndirectDrawCommand[]` and pack them into a GPU indirect-args buffer.
- `scene-wgpu`: `drawWgpuInstancedMeshIndirect(state, proxy, geometry, commandBuffer)` (compute-cull → indirect-draw path); `scene-gl`: feature-detected `multiDrawElementsInstanced` fallback to a CPU loop when unsupported (sentinel/feature-flag, not throw).
- `mergeInstanceBuffers(out, buffers)` — concatenate compatible-layout buffers (batching distinct nodes sharing one geometry/material into one draw).
- Mesh-particle bridge in `@flighthq/particles` (neighbor, not here): an emitter writer that targets an `InstanceBuffer`; this package only guarantees the buffer contract it writes to.
- Capacity/usage diagnostics: `getInstanceBufferByteLength(buffer)`, `getInstanceBufferGpuUploadVersion(state, buffer)`.

Quality bar:

- Colocated `*.test.ts` per source file: packing round-trips (TRS↔matrix, color), alias-safe `out` cases, swap-remove keeps the live range packed, grow preserves data, cull/sort correctness, dirty-range coalescing.
- Functional render scenes: a foliage field and a crowd grid, run across `scene-gl` and `scene-wgpu` with screenshot baselines and **parity** (the two GPU backends agree) plus regression fingerprints — proving instanced draw matches a non-instanced reference draw of the same scene.
- `flighthq-instancing` Rust crate at 1:1 conformance: `create_instance_buffer`, `set_instance_transform`, `cull_instance_buffer`, `draw_gl_instanced_mesh_subset` / `draw_wgpu_instanced_mesh_subset`; instance buffer is a value-typed mixable leaf; scenes paired by name with TS in `flighthq-functional`; any TS↔Rust divergence recorded in the conformance map.
- Docs: a short `tools/agents/docs` note on the instance-stream-as-second-vertex-buffer model and the divisor/stepMode mapping.

Effort: high. Indirect/GPU-cull and the LOD set are the largest items and depend on backend feature availability; sort/merge/mesh-particle bridge are independently shippable on top of Silver.

## Boundaries

- **Geometry, materials, and shaders stay in `@flighthq/mesh` / `@flighthq/materials` / the backend material renderers.** Instancing supplies only the per-instance stream and the divisor/stepMode binding; the per-instance shader variant is a compiled variant of an _existing_ material renderer, not a new material system here.
- **The scene graph stays in `@flighthq/scene`.** `InstancedMesh` is a leaf in that hierarchy; if the trait coupling is cleaner there, the node type lives in `@flighthq/scene` and only the buffer/packers live in `@flighthq/instancing` (open question).
- **No Canvas2D/DOM path.** No instancing substrate; consistent with the GPU-only render scope.
- **No `*Backend` platform seam.** Not a host capability — pure renderer plumbing over the existing render state and registry.
- **Mesh-particle emission lives in `@flighthq/particles`**, writing into an `InstanceBuffer` this package defines. CPU particle simulation, forces, and lifetimes are not here.
- **Skinned/animated per-instance variation** (per-instance skeleton pose) is a future skinning concern; this package handles rigid per-instance transforms.
- **Indirect/compute-cull beyond the documented entry points** (full GPU-driven render pipeline, persistent visibility buffers) is a Gold+ direction, kept behind feature detection rather than assumed.

## Open design questions

- **Does `InstancedMesh` live in `@flighthq/scene` or `@flighthq/instancing`?** It shares the `SceneNode` trait family with `Mesh`, which argues for `scene`; but the per-instance buffer is the whole reason it exists, which argues for `instancing`. Leaning: node type + `Kind` in `scene` (with `Mesh`), buffer + packers + draw helpers in `instancing` — keeps `scene` the single owner of node kinds and keeps `instancing` a tree-shakable value-typed leaf.
- **One material renderer with an `instanced` flag, or a parallel registration?** A flag keeps registration count down but branches the shader compile; a parallel `registerGlInstancedMeshMaterialRenderer` keeps each renderer single-purpose. The mat4-as-four-vec4 vertex-input contract must be identical either way.
- **Is the mat4 model matrix the right canonical per-instance default, or TRS columns?** A full mat4 (4×vec4) is universal and supports non-uniform/sheared instances; a packed TRS (vec3+quat+vec3 = 10 floats vs 16) halves bandwidth for the common case. Possibly ship both layouts (`createInstancedMatrixColorBuffer` vs `createInstancedTrsColorBuffer`) and let the shader variant match.
- **CPU cull vs GPU cull as the default.** CPU `cullInstanceBuffer` is portable and conformance-friendly; GPU compute cull scales further but is backend-gated and harder to fingerprint. Default to CPU, expose GPU as an opt-in Gold path.
- **Per-instance UV/atlas semantics** — does instance UV offset belong here or in a tiling/atlas neighbor? It is the same data-stream mechanism, so it fits the layout, but the _meaning_ (which atlas frame) is a `spritesheet`/atlas concern. Provide the semantic slot; let neighbors give it meaning.
