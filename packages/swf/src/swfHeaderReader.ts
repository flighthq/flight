import type { SwfTagRectangle } from '@flighthq/types/contract';

// Package-internal SWF prefix readers, shared by the header parse and the tag census. They live in
// their own module because both lanes need them but neither should publish them: an application has no
// use for a bit-level rectangle reader, and the public lane is what an application decides.
export const SWF_HEADER_PREFIX_LENGTH = 8;
const SWF_TWIPS_PER_PIXEL = 20;

interface SwfHeaderRectangleResult {
  nextPos: number;
  rect: SwfTagRectangle;
}

export function readSwfHeaderRectangle(data: Uint8Array, offset: number): SwfHeaderRectangleResult | null {
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
      height: Math.max(0, yMax - yMin) / SWF_TWIPS_PER_PIXEL,
      width: Math.max(0, xMax - xMin) / SWF_TWIPS_PER_PIXEL,
      x: xMin / SWF_TWIPS_PER_PIXEL,
      y: yMin / SWF_TWIPS_PER_PIXEL,
    },
  };
}

export function readSwfHeaderUint32(data: Uint8Array, offset: number): number {
  return data[offset] + data[offset + 1] * 0x100 + data[offset + 2] * 0x10000 + data[offset + 3] * 0x1000000;
}
