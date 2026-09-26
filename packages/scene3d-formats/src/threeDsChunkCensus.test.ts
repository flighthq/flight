import {
  THREE_DS_CAMERA,
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_EDITOR,
  THREE_DS_LIGHT,
  THREE_DS_MAIN,
  THREE_DS_MATERIAL,
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
    expect(getThreeDsChunkName(THREE_DS_LIGHT)).toBe('Light');
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
