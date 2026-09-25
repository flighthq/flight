import type { Decompressor, HostDecompressLzmaCapability } from '@flighthq/types/contract';
import { CompressionFraming } from '@flighthq/types/contract';

export const decompressLzma: Decompressor = (compressed, uncompressedLength, framing) => {
  if (framing !== CompressionFraming.Raw) return null;
  if (compressed.length < LZMA_HEADER_SIZE) return null;

  try {
    return lzmaDecode(compressed as Uint8Array, uncompressedLength);
  } catch {
    return null;
  }
};

export const sdkHostDecompressLzma: HostDecompressLzmaCapability = { decompress: decompressLzma };

function lzmaDecode(input: Uint8Array, uncompressedLength: number): Uint8Array {
  const propByte = input[0];
  if (propByte >= 225) throw new Error('lzma: invalid properties byte');

  const lc = propByte % 9;
  const remainder = (propByte - lc) / 9;
  const lp = remainder % 5;
  const pb = (remainder - lp) / 5;

  let dictSize = (input[1] | (input[2] << 8) | (input[3] << 16) | ((input[4] << 24) >>> 0)) >>> 0;
  if (dictSize < LZMA_MIN_DICT_SIZE) dictSize = LZMA_MIN_DICT_SIZE;

  const headerSizeLo = (input[5] | (input[6] << 8) | (input[7] << 16) | ((input[8] << 24) >>> 0)) >>> 0;
  const headerSizeHi = (input[9] | (input[10] << 8) | (input[11] << 16) | ((input[12] << 24) >>> 0)) >>> 0;
  const headerSizeKnown = !(headerSizeLo === 0xffffffff && headerSizeHi === 0xffffffff);
  if (headerSizeKnown && headerSizeHi > 0) throw new Error('lzma: size exceeds addressable range');

  if (uncompressedLength > 0 && headerSizeKnown && uncompressedLength !== headerSizeLo)
    throw new Error('lzma: caller size disagrees with header');

  let expectedSize: number;
  let sizeKnown: boolean;
  if (headerSizeKnown) {
    expectedSize = headerSizeLo;
    sizeKnown = true;
  } else if (uncompressedLength > 0) {
    expectedSize = uncompressedLength;
    sizeKnown = true;
  } else {
    expectedSize = 0;
    sizeKnown = false;
  }
  if (sizeKnown && expectedSize > MAX_LZMA_BYTES) throw new Error('lzma: size exceeds the decode limit');

  const rcStart = LZMA_HEADER_SIZE;
  if (rcStart + 5 > input.length) throw new Error('lzma: truncated range coder');
  if (input[rcStart] !== 0x00) throw new Error('lzma: invalid range coder start byte');
  let rcRange = 0xffffffff;
  let rcCode =
    ((input[rcStart + 1] << 24) | (input[rcStart + 2] << 16) | (input[rcStart + 3] << 8) | input[rcStart + 4]) >>> 0;
  let rcPos = rcStart + 5;

  const numPosStates = 1 << pb;
  const posMask = numPosStates - 1;
  const isMatch = initProbs(NUM_STATES * numPosStates);
  const isRep = initProbs(NUM_STATES);
  const isRepG0 = initProbs(NUM_STATES);
  const isRepG1 = initProbs(NUM_STATES);
  const isRepG2 = initProbs(NUM_STATES);
  const isRep0Long = initProbs(NUM_STATES * numPosStates);
  const litProbs = initProbs((1 << (lc + lp)) * 0x300);
  const matchLenChoice = initProbs(2);
  const matchLenLow = initProbs(numPosStates << 3);
  const matchLenMid = initProbs(numPosStates << 3);
  const matchLenHigh = initProbs(256);
  const repLenChoice = initProbs(2);
  const repLenLow = initProbs(numPosStates << 3);
  const repLenMid = initProbs(numPosStates << 3);
  const repLenHigh = initProbs(256);
  const distSlotCoders = initProbs(NUM_LEN_TO_POS_STATES * 64);
  const posDecoders = initProbs(NUM_FULL_DISTANCES - END_POS_MODEL_INDEX);
  const alignDecoders = initProbs(1 << NUM_ALIGN_BITS);

  const outputLimit = sizeKnown ? expectedSize : MAX_LZMA_BYTES;
  let output = new Uint8Array(
    sizeKnown ? expectedSize : Math.min(Math.max(dictSize, INITIAL_LZMA_BYTES), MAX_LZMA_BYTES),
  );
  let outPos = 0;

  let state = 0;
  let rep0 = 0;
  let rep1 = 0;
  let rep2 = 0;
  let rep3 = 0;

  function rcNormalize(): void {
    if (rcRange < TOP_VALUE) {
      rcRange = (rcRange << 8) >>> 0;
      rcCode = ((rcCode << 8) | (rcPos < input.length ? input[rcPos] : 0)) >>> 0;
      rcPos++;
    }
  }

  function rcDecodeBit(probs: Uint16Array, index: number): number {
    rcNormalize();
    const bound = ((rcRange >>> PROB_BITS) * probs[index]) >>> 0;
    if (rcCode < bound) {
      rcRange = bound;
      probs[index] += ((1 << PROB_BITS) - probs[index]) >> MOVE_BITS;
      return 0;
    }
    rcRange = (rcRange - bound) >>> 0;
    rcCode = (rcCode - bound) >>> 0;
    probs[index] -= probs[index] >> MOVE_BITS;
    return 1;
  }

  function rcDecodeDirectBits(count: number): number {
    let result = 0;
    for (let i = 0; i < count; i++) {
      rcNormalize();
      rcRange = (rcRange >>> 1) >>> 0;
      result <<= 1;
      if (rcCode >= rcRange) {
        rcCode = (rcCode - rcRange) >>> 0;
        result |= 1;
      }
    }
    return result;
  }

  function rcDecodeBitTree(probs: Uint16Array, offset: number, numBits: number): number {
    let m = 1;
    for (let i = 0; i < numBits; i++) {
      m = (m << 1) | rcDecodeBit(probs, offset + m);
    }
    return m - (1 << numBits);
  }

  function rcDecodeBitTreeReverse(probs: Uint16Array, offset: number, numBits: number): number {
    let m = 1;
    let symbol = 0;
    for (let i = 0; i < numBits; i++) {
      const bit = rcDecodeBit(probs, offset + m);
      m = (m << 1) | bit;
      symbol |= bit << i;
    }
    return symbol;
  }

  function decodeMatchLen(posState: number): number {
    if (rcDecodeBit(matchLenChoice, 0) === 0) return rcDecodeBitTree(matchLenLow, posState << 3, 3);
    if (rcDecodeBit(matchLenChoice, 1) === 0) return 8 + rcDecodeBitTree(matchLenMid, posState << 3, 3);
    return 16 + rcDecodeBitTree(matchLenHigh, 0, 8);
  }

  function decodeRepLen(posState: number): number {
    if (rcDecodeBit(repLenChoice, 0) === 0) return rcDecodeBitTree(repLenLow, posState << 3, 3);
    if (rcDecodeBit(repLenChoice, 1) === 0) return 8 + rcDecodeBitTree(repLenMid, posState << 3, 3);
    return 16 + rcDecodeBitTree(repLenHigh, 0, 8);
  }

  function ensureCapacity(needed: number): void {
    if (needed > outputLimit) throw new Error('lzma: output exceeds the decode limit');
    if (needed <= output.length) return;
    let newCap = output.length;
    while (newCap < needed) newCap = newCap < 1 << 30 ? newCap * 2 : newCap + (1 << 30);
    if (newCap > outputLimit) newCap = outputLimit;
    const grown = new Uint8Array(newCap);
    grown.set(output);
    output = grown;
  }

  while (!sizeKnown || outPos < expectedSize) {
    const posState = outPos & posMask;

    if (rcDecodeBit(isMatch, state * numPosStates + posState) === 0) {
      const prevByte = outPos > 0 ? output[outPos - 1] : 0;
      const litState = ((outPos & ((1 << lp) - 1)) << lc) + (prevByte >> (8 - lc));
      const probOffset = litState * 0x300;

      let symbol = 1;
      if (state >= 7) {
        let matchByte = output[outPos - rep0 - 1];
        for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
          const matchBit = (matchByte >> 7) & 1;
          matchByte <<= 1;
          const bit = rcDecodeBit(litProbs, probOffset + ((1 + matchBit) << 8) + symbol);
          symbol = (symbol << 1) | bit;
          if (matchBit !== bit) {
            while (symbol < 0x100) {
              symbol = (symbol << 1) | rcDecodeBit(litProbs, probOffset + symbol);
            }
            break;
          }
        }
      } else {
        while (symbol < 0x100) {
          symbol = (symbol << 1) | rcDecodeBit(litProbs, probOffset + symbol);
        }
      }

      ensureCapacity(outPos + 1);
      output[outPos++] = symbol & 0xff;
      state = STATE_AFTER_LITERAL[state];
    } else if (rcDecodeBit(isRep, state) === 0) {
      const len = MATCH_MIN_LEN + decodeMatchLen(posState);
      state = STATE_AFTER_MATCH[state];

      const lenState = Math.min(len - MATCH_MIN_LEN, NUM_LEN_TO_POS_STATES - 1);
      const distSlot = rcDecodeBitTree(distSlotCoders, lenState * 64, 6);

      let dist: number;
      if (distSlot < 4) {
        dist = distSlot;
      } else {
        const numDirectBits = (distSlot >> 1) - 1;
        dist = ((2 | (distSlot & 1)) << numDirectBits) >>> 0;
        if (distSlot < END_POS_MODEL_INDEX) {
          dist += rcDecodeBitTreeReverse(posDecoders, dist - distSlot - 1, numDirectBits);
        } else {
          dist += rcDecodeDirectBits(numDirectBits - NUM_ALIGN_BITS) << NUM_ALIGN_BITS;
          dist += rcDecodeBitTreeReverse(alignDecoders, 0, NUM_ALIGN_BITS);
        }
      }

      if (dist === 0xffffffff) {
        if (sizeKnown && outPos !== expectedSize) throw new Error('lzma: end marker at wrong position');
        break;
      }

      rep3 = rep2;
      rep2 = rep1;
      rep1 = rep0;
      rep0 = dist;

      if (rep0 >= outPos) throw new Error('lzma: distance exceeds output position');
      ensureCapacity(outPos + len);
      for (let i = 0; i < len; i++) {
        output[outPos] = output[outPos - rep0 - 1];
        outPos++;
      }
    } else {
      let len: number;
      if (rcDecodeBit(isRepG0, state) === 0) {
        if (rcDecodeBit(isRep0Long, state * numPosStates + posState) === 0) {
          if (rep0 >= outPos) throw new Error('lzma: distance exceeds output position');
          state = STATE_AFTER_SHORT_REP[state];
          ensureCapacity(outPos + 1);
          output[outPos] = output[outPos - rep0 - 1];
          outPos++;
          continue;
        }
        len = MATCH_MIN_LEN + decodeRepLen(posState);
      } else {
        let tmp: number;
        if (rcDecodeBit(isRepG1, state) === 0) {
          tmp = rep1;
        } else if (rcDecodeBit(isRepG2, state) === 0) {
          tmp = rep2;
        } else {
          tmp = rep3;
          rep3 = rep2;
        }
        rep2 = rep1;
        rep1 = rep0;
        rep0 = tmp;
        len = MATCH_MIN_LEN + decodeRepLen(posState);
      }
      state = STATE_AFTER_REP[state];

      if (rep0 >= outPos) throw new Error('lzma: distance exceeds output position');
      ensureCapacity(outPos + len);
      for (let i = 0; i < len; i++) {
        output[outPos] = output[outPos - rep0 - 1];
        outPos++;
      }
    }
  }

  if (sizeKnown && outPos !== expectedSize) throw new Error('lzma: output size mismatch');
  return outPos === output.length ? output : output.slice(0, outPos);
}

function initProbs(count: number): Uint16Array {
  const probs = new Uint16Array(count);
  for (let i = 0; i < count; i++) probs[i] = PROB_INIT;
  return probs;
}

const STATE_AFTER_LITERAL = [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 4, 5];
const STATE_AFTER_MATCH = [7, 7, 7, 7, 7, 7, 7, 10, 10, 10, 10, 10];
const STATE_AFTER_REP = [8, 8, 8, 8, 8, 8, 8, 11, 11, 11, 11, 11];
const STATE_AFTER_SHORT_REP = [9, 9, 9, 9, 9, 9, 9, 11, 11, 11, 11, 11];

const LZMA_HEADER_SIZE = 13;
const LZMA_MIN_DICT_SIZE = 1 << 12;
const PROB_INIT = 1024;
const PROB_BITS = 11;
const MOVE_BITS = 5;
const TOP_VALUE = 1 << 24;
const NUM_STATES = 12;
const NUM_LEN_TO_POS_STATES = 4;
const NUM_ALIGN_BITS = 4;
const END_POS_MODEL_INDEX = 14;
const NUM_FULL_DISTANCES = 1 << (END_POS_MODEL_INDEX >> 1);
const MATCH_MIN_LEN = 2;
const MAX_LZMA_BYTES = 256 * 1024 * 1024;
const INITIAL_LZMA_BYTES = 1024;
