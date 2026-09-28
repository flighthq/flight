import {
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_EDITOR,
  THREE_DS_KEYFRAME,
  THREE_DS_KEYFRAME_NODE_HEADER,
  THREE_DS_KEYFRAME_OBJECT_NODE,
  THREE_DS_KEYFRAME_PIVOT,
  THREE_DS_MAIN,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { collectThreeDsPivots } from './threeDsKeyframeHandler.ts';

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

describe('collectThreeDsPivots', () => {
  it('extracts pivots from a keyframer with a named object node', () => {
    const pivot = new Uint8Array(12);
    const pivotView = new DataView(pivot.buffer);
    pivotView.setFloat32(0, 1.0, true);
    pivotView.setFloat32(4, 2.0, true);
    pivotView.setFloat32(8, 3.0, true);

    const nodeName = new Uint8Array([0x42, 0x6f, 0x78, 0x00, 0x00, 0x00]);
    const header = writeChunk(THREE_DS_KEYFRAME_NODE_HEADER, nodeName);
    const pivotChunk = writeChunk(THREE_DS_KEYFRAME_PIVOT, pivot);
    const objectNode = writeChunk(THREE_DS_KEYFRAME_OBJECT_NODE, concatBytes(header, pivotChunk));
    const keyframe = writeChunk(THREE_DS_KEYFRAME, objectNode);
    const main = writeChunk(THREE_DS_MAIN, keyframe);

    const view = new DataView(main.buffer, main.byteOffset, main.byteLength);
    const pivots = collectThreeDsPivots(view, 0);
    expect(pivots.get('Box')).toEqual([1.0, 2.0, 3.0]);
  });

  it('returns empty map when no keyframer is present', () => {
    const editor = writeChunk(THREE_DS_EDITOR, new Uint8Array(0));
    const main = writeChunk(THREE_DS_MAIN, editor);
    const view = new DataView(main.buffer, main.byteOffset, main.byteLength);
    expect(collectThreeDsPivots(view, 0).size).toBe(0);
  });
});
