import type { GltfDocument } from '@flighthq/types/contract';

const GLTF_FEATURE_MESH = 'Mesh';
const GLTF_FEATURE_ANIMATION = 'Animation';
const GLTF_FEATURE_CAMERA = 'Camera';
const GLTF_FEATURE_SKIN = 'Skin';

export const GLTF_FEATURE_NAMES: readonly string[] = [
  GLTF_FEATURE_ANIMATION,
  GLTF_FEATURE_CAMERA,
  GLTF_FEATURE_MESH,
  GLTF_FEATURE_SKIN,
];

export function collectGlbFeatures(bytes: Readonly<Uint8Array>): ReadonlySet<string> | null {
  const json = extractGlbJsonChunk(bytes);
  if (json === null) return null;
  return collectGltfFeatures(json);
}

export function collectGltfFeatures(source: GltfDocument | string): ReadonlySet<string> | null {
  let doc: GltfDocument;
  if (typeof source === 'string') {
    try {
      doc = JSON.parse(source) as GltfDocument;
    } catch {
      return null;
    }
  } else {
    doc = source;
  }
  if (doc === null || typeof doc !== 'object') return null;

  const found = new Set<string>();
  if ((doc.meshes?.length ?? 0) > 0) found.add(GLTF_FEATURE_MESH);
  if ((doc.animations?.length ?? 0) > 0) found.add(GLTF_FEATURE_ANIMATION);
  if ((doc.cameras?.length ?? 0) > 0) found.add(GLTF_FEATURE_CAMERA);
  if ((doc.skins?.length ?? 0) > 0) found.add(GLTF_FEATURE_SKIN);
  if (doc.extensionsUsed !== undefined) {
    for (const ext of doc.extensionsUsed) found.add(ext);
  }
  return found;
}

export function extractGlbJsonChunk(bytes: Readonly<Uint8Array>): string | null {
  if (bytes.byteLength < GLB_HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return null;
  const version = view.getUint32(4, true);
  if (version !== 2) return null;
  const declaredLength = view.getUint32(8, true);
  const end = Math.min(declaredLength, bytes.byteLength);

  let offset = GLB_HEADER_BYTES;
  while (offset + GLB_CHUNK_HEADER_BYTES <= end) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const dataStart = offset + GLB_CHUNK_HEADER_BYTES;
    if (dataStart + chunkLength > end) break;
    if (chunkType === GLB_JSON_CHUNK) {
      return new TextDecoder().decode((bytes as Uint8Array).subarray(dataStart, dataStart + chunkLength));
    }
    offset = dataStart + chunkLength;
  }
  return null;
}

const GLB_MAGIC = 0x46546c67;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const GLB_JSON_CHUNK = 0x4e4f534a;
