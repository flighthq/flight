import type { WgpuMeshPipeline } from './WgpuMeshPipeline';

// A compiled wireframe pipeline — a WgpuMeshPipeline (pipeline + group(2) color-uniform layout).
export interface WgpuWireframePipeline extends WgpuMeshPipeline {}

// The wireframe GPU upload of one MeshGeometry: the geometry's shared vertex buffer (reused from the
// triangle upload) plus a derived LINE index buffer — three edges per triangle (i0i1, i1i2, i2i0). The
// wireframe pipeline draws with line-list topology, so it needs a separate line index buffer; the
// vertex buffer is reused (no duplicate vertex memory). Cached per state + geometry, re-derived when
// geometry.version moves. Returns null for non-indexed geometry (this path needs triangle indices).
export interface WgpuWireframeUpload {
  indexFormat: GPUIndexFormat;
  lineIndexBuffer: GPUBuffer;
  version: number;
  vertexBuffer: GPUBuffer;
}
