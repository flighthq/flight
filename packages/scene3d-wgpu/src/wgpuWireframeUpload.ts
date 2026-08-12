import type { WgpuWireframeUpload, MeshGeometry, WgpuRenderState } from '@flighthq/types/contract';

import { ensureWgpuMeshUpload } from './wgpuMeshUpload';
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
// Builds the line-list index array (two indices per triangle edge, three edges per triangle) from a
// geometry's triangle indices, or from a sequential range when the geometry is non-indexed — the same
// split glWireframeUpload makes. Non-indexed geometry reaches here now that the mesh upload accepts it.
function buildLineIndices(geometry: Readonly<MeshGeometry>): Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> {
  const triangleIndices = geometry.indices;
  const stride = geometry.layout.stride;
  const triangleCount =
    triangleIndices !== null
      ? Math.floor(triangleIndices.length / 3)
      : stride > 0
        ? Math.floor(geometry.vertices.byteLength / stride / 3)
        : 0;
  const lineCount = triangleCount * 6;
  const useUint32 = triangleIndices instanceof Uint32Array || lineCount > 65535;
  const lines = useUint32 ? new Uint32Array(lineCount) : new Uint16Array(lineCount);

  for (let t = 0; t < triangleCount; t++) {
    const base = t * 3;
    const i0 = triangleIndices !== null ? triangleIndices[base] : base;
    const i1 = triangleIndices !== null ? triangleIndices[base + 1] : base + 1;
    const i2 = triangleIndices !== null ? triangleIndices[base + 2] : base + 2;
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
