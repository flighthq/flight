import type { MeshGeometry, MeshGeometryRuntime, WgpuRenderState } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import type { WgpuMeshUpload } from './webgpuSceneRuntime';
import { getWgpuSceneRuntime } from './webgpuSceneRuntime';

// Lazily uploads a MeshGeometry's interleaved vertex buffer + index buffer into GPU buffers for this
// WgpuRenderState, caching the result keyed by the geometry entity (the per-state parallel of
// MeshGeometryRuntime.webgpuData). Re-uploads when geometry.version moves past the cached version,
// destroying and replacing the prior buffers. The cached upload is also mirrored onto
// MeshGeometryRuntime.webgpuData so destroyMeshGeometryWgpuData can null the slot. Returns null for
// non-indexed geometry (this path draws indexed subsets only). The vertex layout the pipeline binds
// (canonical 48-byte position/normal/tangent/uv0 record) is fixed on the pipeline, not here.
export function ensureWgpuMeshUpload(state: WgpuRenderState, geometry: Readonly<MeshGeometry>): WgpuMeshUpload | null {
  const indices = geometry.indices;
  if (indices === null) return null;

  const cache = getWgpuSceneRuntime(state).uploadCache;
  let upload = cache.get(geometry);

  if (upload !== undefined && upload.version === geometry.version) {
    return upload;
  }

  const device = state.device;
  if (upload !== undefined) {
    upload.vertexBuffer.destroy();
    upload.indexBuffer?.destroy();
  }

  const vertices = geometry.vertices;
  const vertexBuffer = device.createBuffer({
    size: Math.max(4, alignTo4(vertices.byteLength)),
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices.buffer, vertices.byteOffset, vertices.byteLength);

  const indexBuffer = device.createBuffer({
    size: Math.max(4, alignTo4(indices.byteLength)),
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices.buffer, indices.byteOffset, indices.byteLength);

  upload = {
    indexBuffer,
    indexCount: indices.length,
    indexFormat: indices.BYTES_PER_ELEMENT === 4 ? 'uint32' : 'uint16',
    version: geometry.version,
    vertexBuffer,
  };
  cache.set(geometry, upload);

  const meshRuntime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  if (meshRuntime !== undefined) {
    meshRuntime.webgpuData = upload as unknown as MeshGeometryRuntime['webgpuData'];
  }

  return upload;
}

// GPU buffers written via writeBuffer must be a multiple of 4 bytes; round the requested size up.
function alignTo4(byteLength: number): number {
  return (byteLength + 3) & ~3;
}
