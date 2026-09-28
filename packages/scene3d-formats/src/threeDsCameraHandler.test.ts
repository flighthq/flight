import { THREE_DS_CAMERA, THREE_DS_CHUNK_HEADER_BYTES } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseThreeDsCamera } from './threeDsCameraHandler.ts';

function writeChunk(id: number, payload: Uint8Array): Uint8Array {
  const total = THREE_DS_CHUNK_HEADER_BYTES + payload.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, id, true);
  view.setUint32(2, total, true);
  out.set(payload, THREE_DS_CHUNK_HEADER_BYTES);
  return out;
}

describe('parseThreeDsCamera', () => {
  it('returns a camera with position, target, roll, and focal length', () => {
    const record = new Uint8Array(32);
    const rv = new DataView(record.buffer);
    rv.setFloat32(0, 10, true);
    rv.setFloat32(4, 20, true);
    rv.setFloat32(8, 30, true);
    rv.setFloat32(12, 0, true);
    rv.setFloat32(16, 0, true);
    rv.setFloat32(20, 0, true);
    rv.setFloat32(24, 15, true);
    rv.setFloat32(28, 35, true);
    const chunk = writeChunk(THREE_DS_CAMERA, record);
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const cam = parseThreeDsCamera(view, 0, chunk.byteLength, 'Cam1', null);
    expect(cam).not.toBeNull();
    expect(cam!.position).toEqual([10, 20, 30]);
    expect(cam!.focalLength).toBe(35);
    expect(cam!.roll).toBe(15);
    expect(cam!.name).toBe('Cam1');
  });

  it('returns null when the chunk is truncated', () => {
    const chunk = writeChunk(THREE_DS_CAMERA, new Uint8Array(8));
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    expect(parseThreeDsCamera(view, 0, chunk.byteLength, 'Bad', null)).toBeNull();
  });
});
