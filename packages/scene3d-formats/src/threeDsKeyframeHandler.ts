import type { ThreeDsChunkHandler, ThreeDsParseState } from '@flighthq/types/contract';
import {
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_KEYFRAME,
  THREE_DS_KEYFRAME_NODE_HEADER,
  THREE_DS_KEYFRAME_OBJECT_NODE,
  THREE_DS_KEYFRAME_PIVOT,
  THREE_DS_MAIN,
} from '@flighthq/types/contract';

import { readChunkEnd, readChunkLength, readNullTerminatedString } from './threeDsParse.ts';

export const threeDsKeyframeHandler: Readonly<ThreeDsChunkHandler> = {
  chunkIds: [THREE_DS_KEYFRAME_OBJECT_NODE],
  collect(state: ThreeDsParseState, view: Readonly<DataView>, offset: number): void {
    for (const [name, pivot] of collectThreeDsPivots(view, offset)) state.pivots.set(name, pivot);
  },
};

export const threeDsKeyframeFamily: readonly ThreeDsChunkHandler[] = [threeDsKeyframeHandler];

// Walks the keyframer chunk (0xB000) for object-node PIVOTS ONLY, keyed by node name, and returns them in
// the file's own Z-up space. Empty when the file carries no keyframer.
//
// The keyframer also encodes the node hierarchy and TCB animation tracks, and this deliberately reads
// NEITHER. The hierarchy value in a node header has two documented readings that disagree on edge cases,
// and no file in the reference corpus carries a keyframer to disambiguate them; rotation tracks are
// incremental axis-angle with variable-length per-key spline parameters. A wrong hierarchy would visibly
// misplace geometry that currently renders correctly, so the ambiguous parts stay unread and are recorded
// in agents/scene3d-format-coverage.md. The pivot has neither problem: three float32, unambiguous, and
// applying it is render-neutral by construction (see localizeThreeDsPositions).
export function collectThreeDsPivots(
  view: Readonly<DataView>,
  offset: number,
): Map<string, readonly [number, number, number]> {
  const pivots = new Map<string, readonly [number, number, number]>();
  const end = Math.min(offset + readChunkLength(view, offset), view.byteLength);
  const rootId = view.getUint16(offset, true);

  // The handler-driven parser dispatches one feature chunk at a time, while the legacy parser starts
  // at MAIN. Support both entry points so the shared collector has identical behavior in either path.
  if (rootId === THREE_DS_KEYFRAME_OBJECT_NODE) {
    collectThreeDsObjectNodePivot(view, offset, end, pivots);
    return pivots;
  }
  if (rootId === THREE_DS_KEYFRAME) {
    collectThreeDsNodePivots(view, offset, end, pivots);
    return pivots;
  }

  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) break;

    if (chunkId === THREE_DS_MAIN) {
      for (const [name, pivot] of collectThreeDsPivots(view, cursor)) pivots.set(name, pivot);
    } else if (chunkId === THREE_DS_KEYFRAME) {
      collectThreeDsNodePivots(view, cursor, chunkEnd, pivots);
    }

    cursor = chunkEnd;
  }

  return pivots;
}

// Walks the node tags inside a keyframer chunk, pairing each node's header name with its pivot.
function collectThreeDsNodePivots(
  view: Readonly<DataView>,
  offset: number,
  end: number,
  pivots: Map<string, readonly [number, number, number]>,
): void {
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) return;

    if (chunkId === THREE_DS_KEYFRAME_OBJECT_NODE) {
      collectThreeDsObjectNodePivot(view, cursor, chunkEnd, pivots);
    }

    cursor = chunkEnd;
  }
}

function collectThreeDsObjectNodePivot(
  view: Readonly<DataView>,
  offset: number,
  end: number,
  pivots: Map<string, readonly [number, number, number]>,
): void {
  let name: string | null = null;
  let pivot: readonly [number, number, number] | null = null;
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) break;
    const dataStart = cursor + THREE_DS_CHUNK_HEADER_BYTES;

    if (chunkId === THREE_DS_KEYFRAME_NODE_HEADER) {
      // The header is a NUL-terminated name followed by two flag uint16s and the hierarchy value.
      // Only the name is read — see collectThreeDsPivots for why the hierarchy is not.
      name = readNullTerminatedString(view, dataStart, chunkEnd);
    } else if (chunkId === THREE_DS_KEYFRAME_PIVOT && dataStart + 12 <= chunkEnd) {
      pivot = [
        view.getFloat32(dataStart, true),
        view.getFloat32(dataStart + 4, true),
        view.getFloat32(dataStart + 8, true),
      ];
    }

    cursor = chunkEnd;
  }

  // A zero pivot is the format's default and means the node origin already is the object origin, so
  // recording it would only cost a needless translate compose downstream.
  if (name !== null && name.length > 0 && pivot !== null && (pivot[0] !== 0 || pivot[1] !== 0 || pivot[2] !== 0)) {
    pivots.set(name, pivot);
  }
}
