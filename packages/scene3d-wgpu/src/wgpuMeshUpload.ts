import type { MeshGeometry, MeshGeometryRuntime, WgpuRenderState, WgpuMeshUpload } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { WgpuSkinningAdapter } from '@flighthq/types/contract';

import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';

// Lazily uploads a MeshGeometry's interleaved vertex buffer + index buffer into GPU buffers for this
// WgpuRenderState, caching the result keyed by the geometry entity (the per-state parallel of
// MeshGeometryRuntime.webgpuData). Re-uploads when geometry.version moves past the cached version,
// destroying and replacing the prior buffers. The cached upload is also mirrored onto
// MeshGeometryRuntime.webgpuData so destroyMeshGeometryWgpuData can null the slot. The vertex layout
// the pipeline binds (canonical 48-byte position/normal/tangent/uv0 record) is fixed on the pipeline,
// not here.
//
// Non-indexed geometry uploads too, mirroring ensureGlMeshUpload: no index buffer is created and
// `indexCount` carries the vertex count derived from the layout stride, so the caller issues a
// non-indexed draw over the same count. glTF primitives may legitimately omit indices and the importer
// preserves that, so refusing them here made valid meshes vanish rather than render wrong.
export function ensureWgpuMeshUpload(
  state: WgpuRenderState,
  geometry: Readonly<MeshGeometry>,
  gpuSkinned = false,
): WgpuMeshUpload {
  const indices = geometry.indices;

  const scene = getWgpuScene3DRuntime(state);
  const cache = scene.uploadCache;
  let upload = cache.get(geometry);

  const meshRuntime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  const skinning = scene.skinningAdapter as WgpuSkinningAdapter | null;
  const hasSkinBindPose = gpuSkinned && skinning !== null && skinning.hasBindPose(geometry);
  if (
    upload !== undefined &&
    (hasSkinBindPose ? upload.skinBindUploaded === true : upload.version === geometry.version)
  ) {
    return upload;
  }

  const device = state.device;
  if (upload !== undefined) {
    upload.vertexBuffer.destroy();
    upload.indexBuffer?.destroy();
  }

  const vertices = hasSkinBindPose ? skinning!.getUploadVertices(geometry)! : geometry.vertices;
  const vertexBuffer = device.createBuffer({
    size: Math.max(4, alignTo4(vertices.byteLength)),
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices.buffer, vertices.byteOffset, vertices.byteLength);

  let indexBuffer: GPUBuffer | null = null;
  if (indices !== null) {
    indexBuffer = device.createBuffer({
      size: Math.max(4, alignTo4(indices.byteLength)),
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    writeMeshIndices(device.queue, indexBuffer, indices);
  }

  const stride = geometry.layout.stride;
  upload = {
    indexBuffer,
    indexCount: indices !== null ? indices.length : stride > 0 ? Math.floor(vertices.byteLength / stride) : 0,
    indexFormat: indices === null ? null : indices.BYTES_PER_ELEMENT === 4 ? 'uint32' : 'uint16',
    skinBindUploaded: hasSkinBindPose,
    version: geometry.version,
    vertexBuffer,
  };
  cache.set(geometry, upload);

  if (meshRuntime !== undefined) {
    meshRuntime.webgpuData = upload as unknown as MeshGeometryRuntime['webgpuData'];
  }

  return upload;
}

// GPU buffers written via writeBuffer must be a multiple of 4 bytes; round the requested size up.
function alignTo4(byteLength: number): number {
  return (byteLength + 3) & ~3;
}

// A Uint16 index array with an odd element count occupies 2 mod 4 bytes, which writeBuffer rejects.
// Pad only that upload through a reusable scratch; indexCount remains the source length, so the trailing
// word is buffer padding rather than a drawn index. Uint32 and even-length Uint16 arrays upload directly.
function writeMeshIndices(
  queue: GPUQueue,
  indexBuffer: GPUBuffer,
  indices: Readonly<Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>>,
): void {
  const byteLength = indices.byteLength;
  if ((byteLength & 3) === 0) {
    queue.writeBuffer(indexBuffer, 0, indices.buffer, indices.byteOffset, byteLength);
    return;
  }

  const paddedByteLength = alignTo4(byteLength);
  const wordCount = paddedByteLength / Uint16Array.BYTES_PER_ELEMENT;
  if (_meshIndexScratch.length < wordCount) _meshIndexScratch = new Uint16Array(wordCount);
  _meshIndexScratch.set(indices as Readonly<Uint16Array<ArrayBuffer>>);
  queue.writeBuffer(indexBuffer, 0, _meshIndexScratch.buffer, 0, paddedByteLength);
}

// Grown on demand and shared by odd-length Uint16 uploads; writeBuffer snapshots it before returning.
let _meshIndexScratch = new Uint16Array(0);
