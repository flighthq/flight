import {
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_FACES,
  THREE_DS_TRIMESH,
  THREE_DS_VERTICES,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseThreeDsTrimesh } from './threeDsMeshHandler.ts';

function writeChunk(id: number, payload: Uint8Array): Uint8Array {
  const total = THREE_DS_CHUNK_HEADER_BYTES + payload.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, id, true);
  view.setUint32(2, total, true);
  out.set(payload, THREE_DS_CHUNK_HEADER_BYTES);
  return out;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (let i = 0; i < arrays.length; i++) totalLength += arrays[i].byteLength;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < arrays.length; i++) {
    result.set(arrays[i], offset);
    offset += arrays[i].byteLength;
  }
  return result;
}

function writeVertices(positions: readonly number[]): Uint8Array {
  const count = positions.length / 3;
  const payload = new Uint8Array(2 + count * 3 * 4);
  const view = new DataView(payload.buffer);
  view.setUint16(0, count, true);
  let offset = 2;
  for (let i = 0; i < positions.length; i++) {
    view.setFloat32(offset, positions[i], true);
    offset += 4;
  }
  return writeChunk(THREE_DS_VERTICES, payload);
}

function writeFaces(indices: readonly number[]): Uint8Array {
  const count = indices.length / 3;
  const payload = new Uint8Array(2 + count * 4 * 2);
  const view = new DataView(payload.buffer);
  view.setUint16(0, count, true);
  let offset = 2;
  for (let i = 0; i < count; i++) {
    view.setUint16(offset, indices[i * 3], true);
    view.setUint16(offset + 2, indices[i * 3 + 1], true);
    view.setUint16(offset + 4, indices[i * 3 + 2], true);
    view.setUint16(offset + 6, 0, true);
    offset += 8;
  }
  return writeChunk(THREE_DS_FACES, payload);
}

describe('parseThreeDsTrimesh', () => {
  it('returns a mesh with vertices and faces', () => {
    const verts = writeVertices([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const faces = writeFaces([0, 1, 2]);
    const chunk = writeChunk(THREE_DS_TRIMESH, concatBytes(verts, faces));
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const mesh = parseThreeDsTrimesh(view, 0, chunk.byteLength, 'Box', null);
    expect(mesh).not.toBeNull();
    expect(mesh!.name).toBe('Box');
    expect(mesh!.vertices).toHaveLength(9);
    expect(mesh!.faces).toHaveLength(3);
  });

  it('returns null when vertex data is missing', () => {
    const chunk = writeChunk(THREE_DS_TRIMESH, new Uint8Array(0));
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    expect(parseThreeDsTrimesh(view, 0, chunk.byteLength, 'Empty', null)).toBeNull();
  });
});
