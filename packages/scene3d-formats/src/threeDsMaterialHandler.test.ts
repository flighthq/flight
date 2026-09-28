import {
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_COLOR_BYTE,
  THREE_DS_MATERIAL,
  THREE_DS_MATERIAL_DIFFUSE,
  THREE_DS_MATERIAL_NAME,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseThreeDsMaterial, threeDsMaterialFamily, threeDsMaterialHandler } from './threeDsMaterialHandler.ts';

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

function writeNullTerminatedString(s: string): Uint8Array {
  const out = new Uint8Array(s.length + 1);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  out[s.length] = 0;
  return out;
}

function writeColorByte(r: number, g: number, b: number): Uint8Array {
  return writeChunk(THREE_DS_COLOR_BYTE, new Uint8Array([r, g, b]));
}

describe('parseThreeDsMaterial', () => {
  it('returns a material with the parsed name and diffuse color', () => {
    const nameChunk = writeChunk(THREE_DS_MATERIAL_NAME, writeNullTerminatedString('Skin'));
    const diffuseChunk = writeChunk(THREE_DS_MATERIAL_DIFFUSE, writeColorByte(204, 102, 51));
    const chunk = writeChunk(THREE_DS_MATERIAL, concatBytes(nameChunk, diffuseChunk));
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const mat = parseThreeDsMaterial(view, 0, chunk.byteLength);
    expect(mat.name).toBe('Skin');
    expect(mat.diffuse[0]).toBeCloseTo(204 / 255, 2);
    expect(mat.diffuse[1]).toBeCloseTo(102 / 255, 2);
  });
});

describe('threeDsMaterialFamily', () => {
  it('claims THREE_DS_MATERIAL', () => {
    expect(threeDsMaterialFamily.flatMap((h) => [...h.chunkIds])).toContain(THREE_DS_MATERIAL);
  });
});

describe('threeDsMaterialHandler', () => {
  it('is the sole member of its family', () => {
    expect(threeDsMaterialFamily).toEqual([threeDsMaterialHandler]);
  });
});
