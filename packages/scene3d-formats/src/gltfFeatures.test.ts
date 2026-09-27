import type { GltfDocument } from '@flighthq/types/contract';

import { collectGlbFeatures, collectGltfFeatures, extractGlbJsonChunk } from './gltfFeatures.ts';

describe('collectGlbFeatures', () => {
  it('returns null for a buffer too small for the header', () => {
    expect(collectGlbFeatures(new Uint8Array(8))).toBeNull();
  });

  it('returns null for wrong magic bytes', () => {
    const bytes = buildGlb(JSON.stringify({ asset: { version: '2.0' } }));
    new DataView(bytes.buffer).setUint32(0, 0x12345678, true);
    expect(collectGlbFeatures(bytes)).toBeNull();
  });

  it('returns null for wrong version', () => {
    const bytes = buildGlb(JSON.stringify({ asset: { version: '2.0' } }));
    new DataView(bytes.buffer).setUint32(4, 1, true);
    expect(collectGlbFeatures(bytes)).toBeNull();
  });

  it('returns null when JSON chunk is truncated', () => {
    const bytes = buildGlb(JSON.stringify({ asset: { version: '2.0' }, meshes: [{}] }));
    const truncated = bytes.subarray(0, 20);
    expect(collectGlbFeatures(truncated)).toBeNull();
  });

  it('returns null when declared length exceeds buffer and JSON chunk extends past it', () => {
    const json = JSON.stringify({ asset: { version: '2.0' }, meshes: [{}] });
    const bytes = buildGlb(json);
    const shortened = bytes.subarray(0, bytes.byteLength - 1);
    new DataView(shortened.buffer).setUint32(8, bytes.byteLength + 100, true);
    expect(collectGlbFeatures(shortened)).toBeNull();
  });

  it('extracts features from a valid GLB', () => {
    const doc = { asset: { version: '2.0' }, meshes: [{}], cameras: [{}] };
    const bytes = buildGlb(JSON.stringify(doc));
    const features = collectGlbFeatures(bytes)!;
    expect(features).not.toBeNull();
    expect([...features].sort()).toEqual(['Camera', 'Mesh']);
  });

  it('returns null when GLB has no JSON chunk', () => {
    const bytes = buildGlbWithChunkType(JSON.stringify({ asset: { version: '2.0' } }), 0x004e4942);
    expect(collectGlbFeatures(bytes)).toBeNull();
  });

  it('handles GLB with empty JSON chunk', () => {
    const bytes = buildGlb('{}');
    const features = collectGlbFeatures(bytes)!;
    expect(features).not.toBeNull();
    expect(features.size).toBe(0);
  });
});

describe('collectGltfFeatures', () => {
  it('returns an empty set for a minimal valid document', () => {
    const doc: GltfDocument = { asset: { version: '2.0' } } as GltfDocument;
    const features = collectGltfFeatures(doc)!;
    expect(features).not.toBeNull();
    expect([...features]).toEqual([]);
  });

  it('returns null for invalid JSON string', () => {
    expect(collectGltfFeatures('not valid json {')).toBeNull();
  });

  it('returns null for a JSON string that parses to null', () => {
    expect(collectGltfFeatures('null')).toBeNull();
  });

  it('returns null for a JSON string that parses to a non-object', () => {
    expect(collectGltfFeatures('"hello"')).toBeNull();
  });

  it('reports Mesh when meshes array is non-empty', () => {
    const doc = { asset: { version: '2.0' }, meshes: [{}] } as GltfDocument;
    const features = collectGltfFeatures(doc)!;
    expect(features.has('Mesh')).toBe(true);
  });

  it('does not report Mesh when meshes array is empty', () => {
    const doc = { asset: { version: '2.0' }, meshes: [] } as GltfDocument;
    const features = collectGltfFeatures(doc)!;
    expect(features.has('Mesh')).toBe(false);
  });

  it('reports Animation when animations array is non-empty', () => {
    const doc = { asset: { version: '2.0' }, animations: [{}] } as GltfDocument;
    const features = collectGltfFeatures(doc)!;
    expect(features.has('Animation')).toBe(true);
  });

  it('reports Camera when cameras array is non-empty', () => {
    const doc = { asset: { version: '2.0' }, cameras: [{}] } as GltfDocument;
    const features = collectGltfFeatures(doc)!;
    expect(features.has('Camera')).toBe(true);
  });

  it('reports Skin when skins array is non-empty', () => {
    const doc = { asset: { version: '2.0' }, skins: [{}] } as GltfDocument;
    const features = collectGltfFeatures(doc)!;
    expect(features.has('Skin')).toBe(true);
  });

  it('reports extensions from extensionsUsed', () => {
    const doc = {
      asset: { version: '2.0' },
      extensionsUsed: ['KHR_materials_unlit', 'KHR_draco_mesh_compression'],
    } as GltfDocument;
    const features = collectGltfFeatures(doc)!;
    expect(features.has('KHR_materials_unlit')).toBe(true);
    expect(features.has('KHR_draco_mesh_compression')).toBe(true);
  });

  it('does not report extensions when extensionsUsed is absent', () => {
    const doc = { asset: { version: '2.0' }, meshes: [{}] } as GltfDocument;
    const features = collectGltfFeatures(doc)!;
    expect([...features]).toEqual(['Mesh']);
  });

  it('reports all features for a full model', () => {
    const doc = {
      asset: { version: '2.0' },
      animations: [{}],
      cameras: [{}],
      meshes: [{}],
      skins: [{}],
      extensionsUsed: ['KHR_materials_unlit'],
    } as GltfDocument;
    const features = collectGltfFeatures(doc)!;
    expect([...features].sort()).toEqual(['Animation', 'Camera', 'KHR_materials_unlit', 'Mesh', 'Skin']);
  });

  it('parses a JSON string into features', () => {
    const json = JSON.stringify({ asset: { version: '2.0' }, meshes: [{}], animations: [{}] });
    const features = collectGltfFeatures(json)!;
    expect(features.has('Mesh')).toBe(true);
    expect(features.has('Animation')).toBe(true);
  });

  it('returns valid empty set for document with only empty arrays', () => {
    const doc = {
      asset: { version: '2.0' },
      meshes: [],
      animations: [],
      cameras: [],
      skins: [],
    } as GltfDocument;
    const features = collectGltfFeatures(doc)!;
    expect(features).not.toBeNull();
    expect(features.size).toBe(0);
  });
});

describe('extractGlbJsonChunk', () => {
  it('returns null for empty buffer', () => {
    expect(extractGlbJsonChunk(new Uint8Array(0))).toBeNull();
  });

  it('extracts JSON from a valid GLB', () => {
    const json = '{"asset":{"version":"2.0"}}';
    const bytes = buildGlb(json);
    const extracted = extractGlbJsonChunk(bytes)!;
    expect(JSON.parse(extracted)).toEqual(JSON.parse(json));
  });

  it('returns null for chunk header that extends past declared length', () => {
    const json = '{"test":true}';
    const bytes = buildGlb(json);
    new DataView(bytes.buffer).setUint32(8, 13, true);
    expect(extractGlbJsonChunk(bytes)).toBeNull();
  });
});

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;

function buildGlb(json: string): Uint8Array {
  return buildGlbWithChunkType(json, GLB_JSON_CHUNK_TYPE);
}

function buildGlbWithChunkType(json: string, chunkType: number): Uint8Array {
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(json);
  const paddedLength = (jsonBytes.byteLength + 3) & ~3;
  const totalLength = 12 + 8 + paddedLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);

  view.setUint32(12, paddedLength, true);
  view.setUint32(16, chunkType, true);
  bytes.set(jsonBytes, 20);
  for (let i = jsonBytes.byteLength; i < paddedLength; i++) {
    bytes[20 + i] = 0x20;
  }

  return bytes;
}
