import type { MeshGeometry, WgpuRenderState } from '@flighthq/types';

import { ensureWgpuMeshUpload } from './wgpuMeshUpload';

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

// Lazily derives + uploads the wireframe line-index buffer for a geometry on this state, caching it
// keyed by the geometry entity. Reuses the geometry's vertex buffer (ensuring the triangle upload
// first) and builds a line-list index buffer from the triangle indices. A subset's triangle range
// [indexOffset, +indexCount) maps to the line range [indexOffset * 2, +indexCount * 2) (each triangle
// index yields two line indices), so the renderer draws a sub-range of this buffer.
export function ensureWgpuWireframeUpload(
  state: WgpuRenderState,
  geometry: Readonly<MeshGeometry>,
): WgpuWireframeUpload | null {
  const meshUpload = ensureWgpuMeshUpload(state, geometry);
  if (meshUpload === null) return null;

  let perState = wireframeUploads.get(state);
  if (perState === undefined) {
    perState = new WeakMap();
    wireframeUploads.set(state, perState);
  }

  let upload = perState.get(geometry as MeshGeometry);
  if (upload !== undefined && upload.version === geometry.version) {
    return upload;
  }

  const device = state.device;
  if (upload !== undefined) upload.lineIndexBuffer.destroy();

  const lines = buildLineIndices(geometry);
  const lineIndexBuffer = device.createBuffer({
    size: Math.max(4, alignTo4(lines.byteLength)),
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(lineIndexBuffer, 0, lines.buffer, lines.byteOffset, lines.byteLength);

  upload = {
    indexFormat: lines instanceof Uint32Array ? 'uint32' : 'uint16',
    lineIndexBuffer,
    version: geometry.version,
    vertexBuffer: meshUpload.vertexBuffer,
  };
  perState.set(geometry as MeshGeometry, upload);
  return upload;
}

// Builds the line-list index array (two indices per triangle edge, three edges per triangle) from a
// geometry's triangle indices. Promotes to Uint32 when any line index exceeds the Uint16 range.
function buildLineIndices(geometry: Readonly<MeshGeometry>): Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> {
  const triangleIndices = geometry.indices!;
  const triangleCount = Math.floor(triangleIndices.length / 3);
  const lineCount = triangleCount * 6;
  const useUint32 = triangleIndices instanceof Uint32Array || lineCount > 65535;
  const lines = useUint32 ? new Uint32Array(lineCount) : new Uint16Array(lineCount);

  for (let t = 0; t < triangleCount; t++) {
    const base = t * 3;
    const i0 = triangleIndices[base];
    const i1 = triangleIndices[base + 1];
    const i2 = triangleIndices[base + 2];
    const out = t * 6;
    lines[out] = i0;
    lines[out + 1] = i1;
    lines[out + 2] = i1;
    lines[out + 3] = i2;
    lines[out + 4] = i2;
    lines[out + 5] = i0;
  }
  return lines;
}

// GPU buffers written via writeBuffer must be a multiple of 4 bytes; round the requested size up.
function alignTo4(byteLength: number): number {
  return (byteLength + 3) & ~3;
}

// Per-state wireframe upload caches, keyed by geometry. Module-local (not a runtime slot) since
// wireframe is the only consumer; the outer WeakMap drops a state's caches when the state is GC'd.
const wireframeUploads = new WeakMap<WgpuRenderState, WeakMap<MeshGeometry, WgpuWireframeUpload>>();
