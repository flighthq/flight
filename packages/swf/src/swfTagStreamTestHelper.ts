import type { SwfTagHandlerDispatch, SwfTagParseState } from '@flighthq/types/contract';

import { expandSwfTagHandlerDispatch } from './expandSwfTagHandlerDispatch.ts';
import { swfAllTagHandlers } from './swfAllTagHandlers.ts';

// Builds the SWF containers and tag records the importer tests read. A test that asserts on what the
// importer does with a document needs a document to hand it, and hand-writing the bit-packed RECT and
// the two tag-header widths in each test file is where the earlier copies of these drifted apart.

export function countSwfSignedBits(values: ReadonlyArray<number>): number {
  for (let bits = 1; bits < 32; bits++) {
    const minimum = -(2 ** (bits - 1));
    const maximum = 2 ** (bits - 1) - 1;
    if (values.every((value) => value >= minimum && value <= maximum)) return bits;
  }
  return 32;
}

export function createSwfFileBytes(tags: ReadonlyArray<Uint8Array>): Uint8Array {
  const body = joinSwfBytes(
    createSwfRectangleRecord(0, 2000, 0, 1000),
    swfUint16Bytes(24 * 256),
    swfUint16Bytes(1),
    ...tags,
  );
  const fileLength = SWF_PREFIX_LENGTH + body.length;
  return joinSwfBytes(new Uint8Array([0x46, 0x57, 0x53, 9]), swfUint32Bytes(fileLength), body);
}

export function createSwfMatrixRecord(a: number, b: number, c: number, d: number, tx: number, ty: number): Uint8Array {
  const writer = new SwfBitWriter();
  const scales = [Math.round(a * FIXED_16_ONE), Math.round(d * FIXED_16_ONE)];
  const rotates = [Math.round(b * FIXED_16_ONE), Math.round(c * FIXED_16_ONE)];
  const scaleBits = countSwfSignedBits(scales);
  const rotateBits = countSwfSignedBits(rotates);
  const translateBits = countSwfSignedBits([tx, ty]);

  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(scaleBits, 5);
  for (const value of scales) writer.writeSigned(value, scaleBits);
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(rotateBits, 5);
  for (const value of rotates) writer.writeSigned(value, rotateBits);
  writer.writeUnsigned(translateBits, 5);
  writer.writeSigned(tx, translateBits);
  writer.writeSigned(ty, translateBits);
  return writer.toBytes();
}

export function createSwfRectangleRecord(xMin: number, xMax: number, yMin: number, yMax: number): Uint8Array {
  const writer = new SwfBitWriter();
  const values = [xMin, xMax, yMin, yMax];
  const bits = countSwfSignedBits(values);
  writer.writeUnsigned(bits, 5);
  for (const value of values) writer.writeSigned(value, bits);
  return writer.toBytes();
}

export function createSwfTagRecord(code: number, body: Uint8Array = new Uint8Array()): Uint8Array {
  const shortLength = body.length < 0x3f ? body.length : 0x3f;
  const header = swfUint16Bytes((code << 6) | shortLength);
  return shortLength === 0x3f ? joinSwfBytes(header, swfUint32Bytes(body.length), body) : joinSwfBytes(header, body);
}

// The empty state one import fills, for a test that drives a single tag's reader rather than a whole
// document. `dispatch` defaults to every handler, which is what a nested sprite body would be walked with.
export function createSwfTestParseState(dispatch?: SwfTagHandlerDispatch): SwfTagParseState {
  return {
    abcBlobs: [],
    backgroundColor: null,
    characterBounds: new Map(),
    definedCharacters: new Set(),
    diagnostics: undefined,
    dispatch: dispatch ?? expandSwfTagHandlerDispatch(swfAllTagHandlers),
    editTexts: new Map(),
    fontCodePoints: new Map(),
    fontNames: new Map(),
    fontOutlineSources: new Map(),
    images: new Map(),
    imageTextures: new Map(),
    jpegAlphaPayloads: new Map(),
    jpegTables: null,
    linkages: new Map(),
    morphBounds: new Map(),
    morphShapes: new Map(),
    pendingInitActions: [],
    pendingTexts: [],
    remainingFrameEntries: 1_000_000,
    scalingGrids: new Map(),
    shapes: new Map(),
    soundCuesAwaitingClass: [],
    soundCuesAwaitingRate: [],
    soundResources: new Map(),
    sounds: new Map(),
    sprites: new Map(),
    streamSounds: [],
    videoTextures: new Map(),
    videos: new Map(),
  };
}

export function joinSwfBytes(...parts: ReadonlyArray<Uint8Array>): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export class SwfBitWriter {
  private readonly bits: number[] = [];

  toBytes(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));
    for (let i = 0; i < this.bits.length; i++) {
      bytes[Math.floor(i / 8)] |= this.bits[i] << (7 - (i % 8));
    }
    return bytes;
  }

  writeSigned(value: number, count: number): void {
    this.writeUnsigned(value < 0 ? value + 2 ** count : value, count);
  }

  writeUnsigned(value: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) this.bits.push(Math.floor(value / 2 ** i) & 1);
  }
}

const SWF_PREFIX_LENGTH = 8;

export function swfUint16Bytes(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

export const SWF_PLACE_HAS_CHARACTER = 0x02;

export const SWF_PLACE_HAS_COLOR_TRANSFORM = 0x08;

export const SWF_PLACE_HAS_MATRIX = 0x04;

export const SWF_PLACE_HAS_NAME = 0x20;

export function swfUint32Bytes(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]);
}

// Written out here rather than imported from the reader these fixtures are read by: a writer sharing
// the reader's scale factor would cancel its own error out, and a round trip would pass at any value.
const FIXED_16_ONE = 65536;
