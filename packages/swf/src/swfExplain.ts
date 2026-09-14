import type { SwfContentEntry, SwfContentManifest, SwfTagRectangle } from '@flighthq/types/contract';

import { uncompressSwfSource } from './swfDocument';

const SWF_EXPLAIN_PREFIX_LENGTH = 8;
const SWF_EXPLAIN_MIN_LENGTH = 12;
const SWF_FIXED_8_8_ONE = 0x100;

export function explainSwfContent(source: Uint8Array): SwfContentManifest | null {
  const uncompressed = uncompressSwfSource(source);
  if (uncompressed === null) return null;
  if (uncompressed.length < SWF_EXPLAIN_MIN_LENGTH) return null;
  const version = uncompressed[3];
  const fileLength = readSwfExplainUint32(uncompressed, 4);
  if (version === 0 || fileLength < SWF_EXPLAIN_MIN_LENGTH || fileLength > uncompressed.length) return null;
  const data = uncompressed.subarray(0, fileLength);
  let pos = SWF_EXPLAIN_PREFIX_LENGTH;
  const stageBounds = readSwfExplainRectangle(data, pos);
  if (stageBounds === null) return null;
  pos = stageBounds.nextPos;
  if (pos + 4 > data.length) return null;
  const frameRateRaw = data[pos] + data[pos + 1] * 0x100;
  const frameRate = frameRateRaw / SWF_FIXED_8_8_ONE;
  pos += 2;
  pos += 2;

  const counts = new Map<number, number>();
  let totalTags = 0;
  while (pos < data.length) {
    if (pos + 2 > data.length) return null;
    const tagHeader = data[pos] + data[pos + 1] * 0x100;
    pos += 2;
    const code = tagHeader >> 6;
    const shortLength = tagHeader & 0x3f;
    let length: number;
    if (shortLength === 0x3f) {
      if (pos + 4 > data.length) return null;
      length = readSwfExplainUint32(data, pos);
      pos += 4;
    } else {
      length = shortLength;
    }
    if (length > data.length - pos) return null;
    pos += length;
    if (code === 0) break;
    totalTags++;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const entries: SwfContentEntry[] = [];
  for (const [code, count] of counts) {
    entries.push({
      code,
      count,
      handled: SWF_HANDLED_TAGS.has(code),
      name: SWF_TAG_NAMES.get(code) ?? `Unknown(${code})`,
    });
  }
  entries.sort((a, b) => a.code - b.code);

  return {
    entries,
    frameRate,
    stageBounds: stageBounds.rect,
    totalTags,
  };
}

function readSwfExplainUint32(data: Uint8Array, offset: number): number {
  return data[offset] + data[offset + 1] * 0x100 + data[offset + 2] * 0x10000 + data[offset + 3] * 0x1000000;
}

interface SwfExplainRectangleResult {
  nextPos: number;
  rect: SwfTagRectangle;
}

function readSwfExplainRectangle(data: Uint8Array, offset: number): SwfExplainRectangleResult | null {
  if (offset >= data.length) return null;
  const nbits = data[offset] >> 3;
  const totalBits = 5 + nbits * 4;
  const totalBytes = Math.ceil(totalBits / 8);
  if (offset + totalBytes > data.length) return null;
  let bitPos = offset * 8 + 5;
  const readBits = (count: number): number => {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byteIndex = bitPos >> 3;
      const bitIndex = 7 - (bitPos & 7);
      value = (value << 1) | ((data[byteIndex] >> bitIndex) & 1);
      bitPos++;
    }
    if (count > 0 && (value & (1 << (count - 1))) !== 0) {
      value |= -1 << count;
    }
    return value;
  };
  const xMin = readBits(nbits);
  const xMax = readBits(nbits);
  const yMin = readBits(nbits);
  const yMax = readBits(nbits);
  return {
    nextPos: offset + totalBytes,
    rect: {
      height: Math.max(0, yMax - yMin) / 20,
      width: Math.max(0, xMax - xMin) / 20,
      x: xMin / 20,
      y: yMin / 20,
    },
  };
}

const SWF_HANDLED_TAGS = new Set<number>([
  1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 26, 28, 32, 33, 34, 35, 36, 37, 39, 43, 45, 46,
  48, 56, 59, 60, 62, 70, 72, 75, 76, 78, 82, 83, 84, 86, 89, 90, 94,
]);

const SWF_TAG_NAMES = new Map<number, string>([
  [0, 'End'],
  [1, 'ShowFrame'],
  [2, 'DefineShape'],
  [4, 'PlaceObject'],
  [5, 'RemoveObject'],
  [6, 'DefineBits'],
  [7, 'DefineButton'],
  [8, 'JPEGTables'],
  [9, 'SetBackgroundColor'],
  [10, 'DefineFont'],
  [11, 'DefineText'],
  [12, 'DoAction'],
  [13, 'DefineFontInfo'],
  [14, 'DefineSound'],
  [15, 'StartSound'],
  [17, 'DefineButtonSound'],
  [18, 'SoundStreamHead'],
  [19, 'SoundStreamBlock'],
  [20, 'DefineBitsLossless'],
  [21, 'DefineBitsJPEG2'],
  [22, 'DefineShape2'],
  [24, 'Protect'],
  [26, 'PlaceObject2'],
  [28, 'RemoveObject2'],
  [32, 'DefineShape3'],
  [33, 'DefineText2'],
  [34, 'DefineButton2'],
  [35, 'DefineBitsJPEG3'],
  [36, 'DefineBitsLossless2'],
  [37, 'DefineEditText'],
  [39, 'DefineSprite'],
  [43, 'FrameLabel'],
  [45, 'SoundStreamHead2'],
  [46, 'DefineMorphShape'],
  [48, 'DefineFont2'],
  [56, 'ExportAssets'],
  [57, 'ImportAssets'],
  [59, 'DoInitAction'],
  [60, 'DefineVideoStream'],
  [61, 'VideoFrame'],
  [62, 'DefineFontInfo2'],
  [65, 'ScriptLimits'],
  [69, 'FileAttributes'],
  [70, 'PlaceObject3'],
  [71, 'ImportAssets2'],
  [72, 'DoABC2'],
  [75, 'DefineFont3'],
  [76, 'SymbolClass'],
  [77, 'Metadata'],
  [78, 'DefineScalingGrid'],
  [82, 'DoABC'],
  [83, 'DefineShape4'],
  [84, 'DefineMorphShape2'],
  [86, 'DefineSceneAndFrameLabelData'],
  [87, 'DefineBinaryData'],
  [89, 'StartSound2'],
  [90, 'DefineBitsJPEG4'],
  [91, 'DefineFont4'],
  [94, 'PlaceObject4'],
]);
