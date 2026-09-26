import {
  THREE_DS_CAMERA,
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_EDITOR,
  THREE_DS_LIGHT,
  THREE_DS_LIGHT_SPOT,
  THREE_DS_MAIN,
  THREE_DS_MATERIAL,
  THREE_DS_MATERIAL_BUMP_MAP,
  THREE_DS_MATERIAL_OPACITY_MAP,
  THREE_DS_MATERIAL_TEXTURE_MAP,
  THREE_DS_OBJECT,
  THREE_DS_TRIMESH,
} from '@flighthq/types/contract';

import { collectThreeDsChunkCounts, getThreeDsChunkName } from './threeDsChunkCensus.ts';

describe('collectThreeDsChunkCounts', () => {
  it('counts trimesh, material, light, and camera chunks', () => {
    const file = buildMinimal3ds([
      writeChunk(THREE_DS_MATERIAL, new Uint8Array(4)),
      writeObjectChunk('Box', THREE_DS_TRIMESH, new Uint8Array(4)),
      writeObjectChunk('Lamp', THREE_DS_LIGHT, new Uint8Array(12)),
      writeObjectChunk('Cam', THREE_DS_CAMERA, new Uint8Array(32)),
    ]);
    const counts = collectThreeDsChunkCounts(file);
    expect(counts).not.toBeNull();
    expect(counts!.get(THREE_DS_MATERIAL)).toBe(1);
    expect(counts!.get(THREE_DS_TRIMESH)).toBe(1);
    expect(counts!.get(THREE_DS_LIGHT)).toBe(1);
    expect(counts!.get(THREE_DS_CAMERA)).toBe(1);
  });

  it('counts multiple meshes', () => {
    const file = buildMinimal3ds([
      writeObjectChunk('A', THREE_DS_TRIMESH, new Uint8Array(4)),
      writeObjectChunk('B', THREE_DS_TRIMESH, new Uint8Array(4)),
      writeObjectChunk('C', THREE_DS_TRIMESH, new Uint8Array(4)),
    ]);
    const counts = collectThreeDsChunkCounts(file);
    expect(counts).not.toBeNull();
    expect(counts!.get(THREE_DS_TRIMESH)).toBe(3);
  });

  it('returns empty map for an empty editor chunk', () => {
    const file = buildMinimal3ds([]);
    const counts = collectThreeDsChunkCounts(file);
    expect(counts).not.toBeNull();
    expect(counts!.size).toBe(0);
  });

  it('returns null for input too small for a chunk header', () => {
    expect(collectThreeDsChunkCounts(new Uint8Array(3))).toBeNull();
  });

  it('returns null when the main chunk ID is wrong', () => {
    const bad = buildMinimal3ds([]);
    new DataView(bad.buffer).setUint16(0, 0x0000, true);
    expect(collectThreeDsChunkCounts(bad)).toBeNull();
  });

  it('detects spot light sub-chunk within a light', () => {
    const spotBody = new Uint8Array(24);
    const spotChunk = writeChunk(THREE_DS_LIGHT_SPOT, spotBody);
    const lightBody = new Uint8Array(12 + spotChunk.length);
    lightBody.set(spotChunk, 12);
    const file = buildMinimal3ds([writeObjectChunk('Spot', THREE_DS_LIGHT, lightBody)]);
    const counts = collectThreeDsChunkCounts(file);
    expect(counts).not.toBeNull();
    expect(counts!.get(THREE_DS_LIGHT)).toBe(1);
    expect(counts!.get(THREE_DS_LIGHT_SPOT)).toBe(1);
  });

  it('omits spot count for a point light', () => {
    const lightBody = new Uint8Array(12);
    const file = buildMinimal3ds([writeObjectChunk('Point', THREE_DS_LIGHT, lightBody)]);
    const counts = collectThreeDsChunkCounts(file);
    expect(counts).not.toBeNull();
    expect(counts!.get(THREE_DS_LIGHT)).toBe(1);
    expect(counts!.has(THREE_DS_LIGHT_SPOT)).toBe(false);
  });

  it('detects material texture map sub-chunks', () => {
    const texMap = writeChunk(THREE_DS_MATERIAL_TEXTURE_MAP, new Uint8Array(4));
    const bumpMap = writeChunk(THREE_DS_MATERIAL_BUMP_MAP, new Uint8Array(4));
    const opacMap = writeChunk(THREE_DS_MATERIAL_OPACITY_MAP, new Uint8Array(4));
    const matBody = new Uint8Array(texMap.length + bumpMap.length + opacMap.length);
    matBody.set(texMap, 0);
    matBody.set(bumpMap, texMap.length);
    matBody.set(opacMap, texMap.length + bumpMap.length);
    const file = buildMinimal3ds([writeChunk(THREE_DS_MATERIAL, matBody)]);
    const counts = collectThreeDsChunkCounts(file);
    expect(counts).not.toBeNull();
    expect(counts!.get(THREE_DS_MATERIAL)).toBe(1);
    expect(counts!.get(THREE_DS_MATERIAL_TEXTURE_MAP)).toBe(1);
    expect(counts!.get(THREE_DS_MATERIAL_BUMP_MAP)).toBe(1);
    expect(counts!.get(THREE_DS_MATERIAL_OPACITY_MAP)).toBe(1);
  });

  it('omits texture sub-chunks for a material with no maps', () => {
    const file = buildMinimal3ds([writeChunk(THREE_DS_MATERIAL, new Uint8Array(4))]);
    const counts = collectThreeDsChunkCounts(file);
    expect(counts).not.toBeNull();
    expect(counts!.get(THREE_DS_MATERIAL)).toBe(1);
    expect(counts!.has(THREE_DS_MATERIAL_TEXTURE_MAP)).toBe(false);
  });

  it('stops on a malformed child with zero length', () => {
    const editorBody = new Uint8Array(THREE_DS_CHUNK_HEADER_BYTES);
    const view = new DataView(editorBody.buffer);
    view.setUint16(0, THREE_DS_MATERIAL, true);
    view.setUint32(2, 0, true);
    const file = buildMinimal3ds([editorBody]);
    const counts = collectThreeDsChunkCounts(file);
    expect(counts).not.toBeNull();
    expect(counts!.size).toBe(0);
  });
});

describe('getThreeDsChunkName', () => {
  it('returns known names for recognized chunk IDs', () => {
    expect(getThreeDsChunkName(THREE_DS_TRIMESH)).toBe('Trimesh');
    expect(getThreeDsChunkName(THREE_DS_MATERIAL)).toBe('Material');
    expect(getThreeDsChunkName(THREE_DS_MATERIAL_TEXTURE_MAP)).toBe('MaterialTextureMap');
    expect(getThreeDsChunkName(THREE_DS_MATERIAL_BUMP_MAP)).toBe('MaterialBumpMap');
    expect(getThreeDsChunkName(THREE_DS_MATERIAL_OPACITY_MAP)).toBe('MaterialOpacityMap');
    expect(getThreeDsChunkName(THREE_DS_LIGHT)).toBe('Light');
    expect(getThreeDsChunkName(THREE_DS_LIGHT_SPOT)).toBe('LightSpot');
    expect(getThreeDsChunkName(THREE_DS_CAMERA)).toBe('Camera');
  });

  it('returns a hex label for unknown chunk IDs', () => {
    expect(getThreeDsChunkName(0xbeef)).toBe('Unknown(0xbeef)');
  });
});

function writeChunk(id: number, body: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(THREE_DS_CHUNK_HEADER_BYTES + body.length);
  const view = new DataView(chunk.buffer);
  view.setUint16(0, id, true);
  view.setUint32(2, THREE_DS_CHUNK_HEADER_BYTES + body.length, true);
  chunk.set(body, THREE_DS_CHUNK_HEADER_BYTES);
  return chunk;
}

function writeObjectChunk(name: string, entityChunkId: number, entityBody: Uint8Array): Uint8Array {
  const nameBytes = new Uint8Array(name.length + 1);
  for (let i = 0; i < name.length; i++) nameBytes[i] = name.charCodeAt(i);
  const entityChunk = writeChunk(entityChunkId, entityBody);
  const bodySize = nameBytes.length + entityChunk.length;
  const object = new Uint8Array(THREE_DS_CHUNK_HEADER_BYTES + bodySize);
  const view = new DataView(object.buffer);
  view.setUint16(0, THREE_DS_OBJECT, true);
  view.setUint32(2, THREE_DS_CHUNK_HEADER_BYTES + bodySize, true);
  object.set(nameBytes, THREE_DS_CHUNK_HEADER_BYTES);
  object.set(entityChunk, THREE_DS_CHUNK_HEADER_BYTES + nameBytes.length);
  return object;
}

function buildMinimal3ds(editorChildren: Uint8Array[]): Uint8Array {
  let editorBodySize = 0;
  for (const child of editorChildren) editorBodySize += child.length;
  const editor = new Uint8Array(THREE_DS_CHUNK_HEADER_BYTES + editorBodySize);
  const editorView = new DataView(editor.buffer);
  editorView.setUint16(0, THREE_DS_EDITOR, true);
  editorView.setUint32(2, THREE_DS_CHUNK_HEADER_BYTES + editorBodySize, true);
  let offset = THREE_DS_CHUNK_HEADER_BYTES;
  for (const child of editorChildren) {
    editor.set(child, offset);
    offset += child.length;
  }

  const main = new Uint8Array(THREE_DS_CHUNK_HEADER_BYTES + editor.length);
  const mainView = new DataView(main.buffer);
  mainView.setUint16(0, THREE_DS_MAIN, true);
  mainView.setUint32(2, THREE_DS_CHUNK_HEADER_BYTES + editor.length, true);
  main.set(editor, THREE_DS_CHUNK_HEADER_BYTES);
  return main;
}
