import { THREE_DS_CHUNK_HEADER_BYTES, THREE_DS_COLOR_FLOAT, THREE_DS_LIGHT } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseThreeDsLight } from './threeDsLightHandler.ts';

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

describe('parseThreeDsLight', () => {
  it('returns a point light with position and color', () => {
    const position = new Uint8Array(12);
    const pv = new DataView(position.buffer);
    pv.setFloat32(0, 5, true);
    pv.setFloat32(4, 10, true);
    pv.setFloat32(8, 15, true);
    const colorPayload = new Uint8Array(12);
    const cv = new DataView(colorPayload.buffer);
    cv.setFloat32(0, 1.0, true);
    cv.setFloat32(4, 0.5, true);
    cv.setFloat32(8, 0.0, true);
    const colorChunk = writeChunk(THREE_DS_COLOR_FLOAT, colorPayload);
    const chunk = writeChunk(THREE_DS_LIGHT, concatBytes(position, colorChunk));
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const light = parseThreeDsLight(view, 0, chunk.byteLength, 'Lamp', null);
    expect(light).not.toBeNull();
    expect(light!.position).toEqual([5, 10, 15]);
    expect(light!.color[0]).toBeCloseTo(1.0);
    expect(light!.name).toBe('Lamp');
    expect(light!.target).toBeNull();
  });

  it('returns null when the chunk is truncated', () => {
    const chunk = writeChunk(THREE_DS_LIGHT, new Uint8Array(4));
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    expect(parseThreeDsLight(view, 0, chunk.byteLength, 'Bad', null)).toBeNull();
  });
});
