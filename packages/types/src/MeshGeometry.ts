import type { Aabb } from './Aabb';
import type { Entity, EntityRuntime } from './Entity';
import type { MeshMorphBindPose } from './MeshMorphBindPose';
import type { MeshSkinBindPose } from './MeshSkinBindPose';

// Handedness is pinned across the 3D suite: right-handed coordinates, CCW front-face, and the
// tangent `w` component is the bitangent sign per glTF (bitangent = cross(normal, tangent.xyz)
// * tangent.w). The canonical interleaved PBR vertex record is
//   position(3) + normal(3) + tangent(4, w = handedness) + uv0(2) = 12 f32 / 48 bytes,
// laid out so one record maps 1:1 to a GL vertexAttribPointer table, a GPUVertexBufferLayout,
// and a C offsetof table. Optional uv1/color0/joints0/weights0 channels extend that record through
// the declared layout without changing the canonical base. Index data auto-promotes Uint16 -> Uint32
// past 65k vertices.

// The role an attribute plays, independent of its numeric format. Renderers bind by semantic.
export type VertexSemantic = 'color0' | 'joints0' | 'normal' | 'position' | 'tangent' | 'uv0' | 'uv1' | 'weights0';

// The numeric encoding of one attribute within an interleaved vertex record.
export type VertexFormat = 'float32x2' | 'float32x3' | 'float32x4' | 'uint16x4' | 'uint8x4' | 'unorm8x4';

// How the index/vertex stream assembles into primitives. Default is triangle-list.
export type PrimitiveTopology = 'line-list' | 'line-strip' | 'point-list' | 'triangle-list' | 'triangle-strip';

// One attribute's placement inside the interleaved vertex record: its semantic, its numeric
// format, and its byte offset from the start of the record. `byteOffset` plus the layout's
// `stride` are exactly the GL vertexAttribPointer arguments / GPUVertexAttribute fields.
export interface VertexAttribute {
  byteOffset: number;
  format: VertexFormat;
  semantic: VertexSemantic;
}

// The full interleaved-vertex description: the per-vertex `stride` in bytes and the ordered
// set of attributes packed into each record. One layout describes one interleaved vertex
// buffer (the canonical record above is the default).
export interface VertexAttributeLayout {
  attributes: readonly VertexAttribute[];
  stride: number;
}

// A contiguous draw range within the geometry's index buffer, addressing one material binding.
// `indexOffset` is the first index (in elements, not bytes); `indexCount` is how many indices.
// A geometry with a single material is one subset spanning the whole index buffer.
export interface MeshSubset {
  indexCount: number;
  indexOffset: number;
}

// Interleaved CPU mesh data: one vertex buffer described by `layout`, an index buffer, the
// primitive topology, and the subset ranges. `vertices` is the raw interleaved record bytes
// (read through `layout`); `indices` is null for non-indexed geometry. `bounds` is the cached
// local-space AABB (null until computed by computeMeshGeometryBounds). `version` is bumped
// whenever `vertices`/`indices` change so backends know to re-upload (see
// destroyMeshGeometryGPUData). GPU handles live on the paired runtime, never here.
export interface MeshGeometry extends Entity {
  bounds: Aabb | null;
  indices: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> | null;
  layout: VertexAttributeLayout;
  subsets: readonly MeshSubset[];
  topology: PrimitiveTopology;
  version: number;
  vertices: Float32Array<ArrayBuffer>;
}

// Opaque per-render-state GPU upload of a MeshGeometry for the Gl2 backend (VAO + buffers +
// uploaded `version`). Branded so the header names the slot without leaking the GL types;
// scene-gl owns and casts the concrete shape. Null until the geometry is first uploaded.
export interface MeshGeometryGlData {
  readonly __meshGeometryGlData: unique symbol;
}

// Opaque per-render-state GPU upload of a MeshGeometry for the Wgpu backend (vertex/index
// GPUBuffers + uploaded `version`). Branded; scene-wgpu owns and casts the concrete shape.
// Null until the geometry is first uploaded.
export interface MeshGeometryWgpuData {
  readonly __meshGeometryWgpuData: unique symbol;
}

// Package-private companion to a MeshGeometry. Each backend stores its named GPU upload slot
// here, initialized to null and filled lazily on first draw; destroyMeshGeometryGPUData frees
// them. `skinBindPose` is the CPU-skinning subsystem's slot: null until a skinned mesh is first
// deformed, then the de-interleaved bind pose + scratch captureMeshSkinBindPose builds, reused
// every frame by skinMeshGeometry. `morphBindPose` is the sibling morph slot: null until a morphed
// mesh is first blended, then the de-interleaved base pose + scratch captureMeshMorphBindPose builds,
// reused every frame by blendMeshGeometryMorph. Subsystems read/write only the slot they own.
//
// `boundsVersion` is the `geometry.version` the cached `geometry.bounds` was computed at, so bounds
// are a dirty-gated cache rather than a per-frame recompute: a deform bumps `version` and thereby
// marks bounds stale, and ensureMeshGeometryBounds does the O(vertices) sweep only when
// `boundsVersion !== version`. A GPU-skinned or upload-only mesh that never culls or picks therefore
// pays nothing. -1 means never computed. `morphBlendedWeights` is the weight vector the current blend
// result corresponds to; blendMeshGeometryMorph's caller compares against it to skip re-blending a
// morph whose weights did not move this frame. Null until the first blend.
export interface MeshGeometryRuntime extends EntityRuntime {
  boundsVersion: number;
  morphBindPose: MeshMorphBindPose | null;
  morphBlendedWeights: Float32Array | null;
  skinBindPose: MeshSkinBindPose | null;
  webglData: MeshGeometryGlData | null;
  webgpuData: MeshGeometryWgpuData | null;
}
