import type { HostCompressLzmaCapability } from '@flighthq/types/contract';
import { CompressionFraming } from '@flighthq/types/contract';

export function compressLzma(bytes: Readonly<Uint8Array>): Uint8Array {
  return lzmaEncode(bytes as Uint8Array);
}

export const sdkHostCompressLzma: HostCompressLzmaCapability = {
  compress(bytes: Readonly<Uint8Array>, framing: CompressionFraming): Uint8Array {
    if (framing !== CompressionFraming.Raw) throw new Error('lzma: only Raw framing is supported');
    return compressLzma(bytes);
  },
};

function lzmaEncode(input: Uint8Array): Uint8Array {
  const lc = 3;
  const lp = 0;
  const pb = 2;
  const dictSize = Math.max(LZMA_MIN_DICT_SIZE, nearestPow2(input.length));
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

  let outBuf = new Uint8Array(Math.max(INITIAL_OUTPUT_BYTES, input.length + LZMA_HEADER_SIZE + 64));
  let outPos = 0;

  function pushByte(b: number): void {
    if (outPos >= outBuf.length) {
      const grown = new Uint8Array(outBuf.length * 2);
      grown.set(outBuf);
      outBuf = grown;
    }
    outBuf[outPos++] = b;
  }

  const propByte = pb * 45 + lp * 9 + lc;
  pushByte(propByte);
  pushByte(dictSize & 0xff);
  pushByte((dictSize >>> 8) & 0xff);
  pushByte((dictSize >>> 16) & 0xff);
  pushByte((dictSize >>> 24) & 0xff);
  pushByte(input.length & 0xff);
  pushByte((input.length >>> 8) & 0xff);
  pushByte((input.length >>> 16) & 0xff);
  pushByte((input.length >>> 24) & 0xff);
  pushByte(0);
  pushByte(0);
  pushByte(0);
  pushByte(0);

  let rcLow = 0;
  let rcRange = 0xffffffff;
  let rcCacheSize = 1;
  let rcCache = 0;

  function rcShiftLow(): void {
    const lowHi = Math.floor(rcLow / 0x100000000);
    if (lowHi !== 0 || rcLow < 0xff000000) {
      let temp = rcCache;
      do {
        pushByte((temp + lowHi) & 0xff);
        temp = 0xff;
        rcCacheSize--;
      } while (rcCacheSize !== 0);
      rcCache = (rcLow >>> 24) & 0xff;
    }
    rcCacheSize++;
    rcLow = (rcLow << 8) >>> 0;
  }

  function rcEncodeBit(probs: Uint16Array, index: number, bit: number): void {
    const bound = ((rcRange >>> PROB_BITS) * probs[index]) >>> 0;
    if (bit === 0) {
      rcRange = bound;
      probs[index] += ((1 << PROB_BITS) - probs[index]) >> MOVE_BITS;
    } else {
      rcLow += bound;
      rcRange = (rcRange - bound) >>> 0;
      probs[index] -= probs[index] >> MOVE_BITS;
    }
    if (rcRange < TOP_VALUE) {
      rcRange = (rcRange << 8) >>> 0;
      rcShiftLow();
    }
  }

  function rcEncodeDirectBits(value: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) {
      rcRange = (rcRange >>> 1) >>> 0;
      if (((value >>> i) & 1) === 1) {
        rcLow += rcRange;
      }
      if (rcRange < TOP_VALUE) {
        rcRange = (rcRange << 8) >>> 0;
        rcShiftLow();
      }
    }
  }

  function rcEncodeBitTree(probs: Uint16Array, offset: number, numBits: number, value: number): void {
    let m = 1;
    for (let i = numBits - 1; i >= 0; i--) {
      const bit = (value >>> i) & 1;
      rcEncodeBit(probs, offset + m, bit);
      m = (m << 1) | bit;
    }
  }

  function rcEncodeBitTreeReverse(probs: Uint16Array, offset: number, numBits: number, value: number): void {
    let m = 1;
    for (let i = 0; i < numBits; i++) {
      const bit = (value >>> i) & 1;
      rcEncodeBit(probs, offset + m, bit);
      m = (m << 1) | bit;
    }
  }

  function encodeMatchLen(posState: number, len: number): void {
    if (len < 8) {
      rcEncodeBit(matchLenChoice, 0, 0);
      rcEncodeBitTree(matchLenLow, posState << 3, 3, len);
    } else if (len < 16) {
      rcEncodeBit(matchLenChoice, 0, 1);
      rcEncodeBit(matchLenChoice, 1, 0);
      rcEncodeBitTree(matchLenMid, posState << 3, 3, len - 8);
    } else {
      rcEncodeBit(matchLenChoice, 0, 1);
      rcEncodeBit(matchLenChoice, 1, 1);
      rcEncodeBitTree(matchLenHigh, 0, 8, len - 16);
    }
  }

  function encodeRepLen(posState: number, len: number): void {
    if (len < 8) {
      rcEncodeBit(repLenChoice, 0, 0);
      rcEncodeBitTree(repLenLow, posState << 3, 3, len);
    } else if (len < 16) {
      rcEncodeBit(repLenChoice, 0, 1);
      rcEncodeBit(repLenChoice, 1, 0);
      rcEncodeBitTree(repLenMid, posState << 3, 3, len - 8);
    } else {
      rcEncodeBit(repLenChoice, 0, 1);
      rcEncodeBit(repLenChoice, 1, 1);
      rcEncodeBitTree(repLenHigh, 0, 8, len - 16);
    }
  }

  function encodeLiteral(inPos: number, curByte: number, state: number, rep0: number): void {
    const prevByte = inPos > 0 ? input[inPos - 1] : 0;
    const litState = ((inPos & ((1 << lp) - 1)) << lc) + (prevByte >> (8 - lc));
    const probOffset = litState * 0x300;

    if (state >= 7) {
      let matchByte = input[inPos - rep0 - 1];
      let symbol = 1;
      for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
        const matchBit = (matchByte >> 7) & 1;
        matchByte <<= 1;
        const bit = (curByte >> (7 - bitIndex)) & 1;
        rcEncodeBit(litProbs, probOffset + ((1 + matchBit) << 8) + symbol, bit);
        symbol = (symbol << 1) | bit;
        if (matchBit !== bit) {
          for (let j = bitIndex + 1; j < 8; j++) {
            const b = (curByte >> (7 - j)) & 1;
            rcEncodeBit(litProbs, probOffset + symbol, b);
            symbol = (symbol << 1) | b;
          }
          break;
        }
      }
    } else {
      let symbol = 1;
      for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
        const bit = (curByte >> (7 - bitIndex)) & 1;
        rcEncodeBit(litProbs, probOffset + symbol, bit);
        symbol = (symbol << 1) | bit;
      }
    }
  }

  function getDistSlot(dist: number): number {
    if (dist < 4) return dist;
    let bits = 1;
    let d = dist;
    while (d >= 4) {
      d >>>= 1;
      bits++;
    }
    return (bits << 1) + ((dist >>> (bits - 1)) & 1);
  }

  function encodeDistance(dist: number, lenState: number): void {
    const distSlot = getDistSlot(dist);
    rcEncodeBitTree(distSlotCoders, lenState * 64, 6, distSlot);

    if (distSlot >= 4) {
      const numDirectBits = (distSlot >> 1) - 1;
      const base = ((2 | (distSlot & 1)) << numDirectBits) >>> 0;
      const remainder = dist - base;

      if (distSlot < END_POS_MODEL_INDEX) {
        rcEncodeBitTreeReverse(posDecoders, base - distSlot - 1, numDirectBits, remainder);
      } else {
        rcEncodeDirectBits(remainder >>> NUM_ALIGN_BITS, numDirectBits - NUM_ALIGN_BITS);
        rcEncodeBitTreeReverse(alignDecoders, 0, NUM_ALIGN_BITS, remainder & ((1 << NUM_ALIGN_BITS) - 1));
      }
    }
  }

  const head = new Int32Array(HASH_SIZE).fill(-1);
  const prev = new Int32Array(input.length > 0 ? input.length : 1).fill(-1);

  function hashAt(pos: number): number {
    return ((input[pos] << 10) ^ (input[pos + 1] << 5) ^ input[pos + 2]) & HASH_MASK;
  }

  function findMatch(
    pos: number,
    rep0: number,
    rep1: number,
    rep2: number,
    rep3: number,
  ): { type: number; len: number; dist: number } {
    let bestLen = 1;
    let bestDist = 0;
    let bestType = 0;

    const maxLen = Math.min(MATCH_MAX_LEN, input.length - pos);
    if (maxLen < MATCH_MIN_LEN) return { type: 0, len: 0, dist: 0 };

    const reps = [rep0, rep1, rep2, rep3];
    for (let r = 0; r < 4; r++) {
      const d = reps[r];
      if (d >= pos) continue;
      let rl = 0;
      while (rl < maxLen && input[pos + rl] === input[pos - d - 1 + rl]) rl++;
      if (rl >= MATCH_MIN_LEN && rl > bestLen) {
        bestLen = rl;
        bestDist = d;
        bestType = 10 + r;
        if (rl === maxLen) return { type: bestType, len: bestLen, dist: bestDist };
      }
    }

    if (rep0 < pos && input[pos] === input[pos - rep0 - 1]) {
      if (bestType === 0) {
        bestType = 5;
        bestLen = 1;
        bestDist = rep0;
      }
    }

    if (pos + MATCH_MIN_LEN <= input.length) {
      const key = hashAt(pos);
      let candidate = head[key];
      let attempts = 0;
      while (candidate >= 0 && attempts < MAX_CHAIN) {
        const distance = pos - candidate - 1;
        if (distance >= MAX_DISTANCE) break;
        let ml = 0;
        const limit = Math.min(maxLen, input.length - pos);
        while (ml < limit && input[candidate + ml] === input[pos + ml]) ml++;
        if (ml >= MATCH_MIN_LEN && ml > bestLen) {
          bestLen = ml;
          bestDist = distance;
          bestType = 1;
          if (ml === maxLen) break;
        }
        candidate = prev[candidate];
        attempts++;
      }
      prev[pos] = head[key];
      head[key] = pos;
    }

    if (bestType === 0) return { type: 0, len: 0, dist: 0 };
    return { type: bestType, len: bestLen, dist: bestDist };
  }

  function insertHash(pos: number): void {
    if (pos + MATCH_MIN_LEN <= input.length) {
      const key = hashAt(pos);
      prev[pos] = head[key];
      head[key] = pos;
    }
  }

  let state = 0;
  let rep0 = 0;
  let rep1 = 0;
  let rep2 = 0;
  let rep3 = 0;
  let inPos = 0;

  while (inPos < input.length) {
    const posState = inPos & posMask;
    const match = findMatch(inPos, rep0, rep1, rep2, rep3);

    if (match.type === 0) {
      rcEncodeBit(isMatch, state * numPosStates + posState, 0);
      encodeLiteral(inPos, input[inPos], state, rep0);
      state = STATE_AFTER_LITERAL[state];
      inPos++;
    } else if (match.type === 1) {
      rcEncodeBit(isMatch, state * numPosStates + posState, 1);
      rcEncodeBit(isRep, state, 0);
      const len = match.len;
      encodeMatchLen(posState, len - MATCH_MIN_LEN);
      state = STATE_AFTER_MATCH[state];
      const lenState = Math.min(len - MATCH_MIN_LEN, NUM_LEN_TO_POS_STATES - 1);
      encodeDistance(match.dist, lenState);
      rep3 = rep2;
      rep2 = rep1;
      rep1 = rep0;
      rep0 = match.dist;
      for (let i = 1; i < len; i++) insertHash(inPos + i);
      inPos += len;
    } else if (match.type === 5) {
      rcEncodeBit(isMatch, state * numPosStates + posState, 1);
      rcEncodeBit(isRep, state, 1);
      rcEncodeBit(isRepG0, state, 0);
      rcEncodeBit(isRep0Long, state * numPosStates + posState, 0);
      state = STATE_AFTER_SHORT_REP[state];
      inPos++;
    } else {
      rcEncodeBit(isMatch, state * numPosStates + posState, 1);
      rcEncodeBit(isRep, state, 1);
      const repIndex = match.type - 10;
      if (repIndex === 0) {
        rcEncodeBit(isRepG0, state, 0);
        rcEncodeBit(isRep0Long, state * numPosStates + posState, 1);
      } else {
        rcEncodeBit(isRepG0, state, 1);
        if (repIndex === 1) {
          rcEncodeBit(isRepG1, state, 0);
        } else if (repIndex === 2) {
          rcEncodeBit(isRepG1, state, 1);
          rcEncodeBit(isRepG2, state, 0);
        } else {
          rcEncodeBit(isRepG1, state, 1);
          rcEncodeBit(isRepG2, state, 1);
        }
        if (repIndex === 1) {
          const tmp = rep1;
          rep1 = rep0;
          rep0 = tmp;
        } else if (repIndex === 2) {
          const tmp = rep2;
          rep2 = rep1;
          rep1 = rep0;
          rep0 = tmp;
        } else {
          const tmp = rep3;
          rep3 = rep2;
          rep2 = rep1;
          rep1 = rep0;
          rep0 = tmp;
        }
      }
      const len = match.len;
      encodeRepLen(posState, len - MATCH_MIN_LEN);
      state = STATE_AFTER_REP[state];
      for (let i = 1; i < len; i++) insertHash(inPos + i);
      inPos += len;
    }
  }

  for (let i = 0; i < 5; i++) rcShiftLow();

  return outBuf.slice(0, outPos);
}

function initProbs(count: number): Uint16Array {
  const probs = new Uint16Array(count);
  for (let i = 0; i < count; i++) probs[i] = PROB_INIT;
  return probs;
}

function nearestPow2(n: number): number {
  if (n <= LZMA_MIN_DICT_SIZE) return LZMA_MIN_DICT_SIZE;
  let p = LZMA_MIN_DICT_SIZE;
  while (p < n && p < MAX_DICT_SIZE) p <<= 1;
  return p;
}

const STATE_AFTER_LITERAL = [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 4, 5];
const STATE_AFTER_MATCH = [7, 7, 7, 7, 7, 7, 7, 10, 10, 10, 10, 10];
const STATE_AFTER_REP = [8, 8, 8, 8, 8, 8, 8, 11, 11, 11, 11, 11];
const STATE_AFTER_SHORT_REP = [9, 9, 9, 9, 9, 9, 9, 11, 11, 11, 11, 11];

const LZMA_HEADER_SIZE = 13;
const LZMA_MIN_DICT_SIZE = 1 << 12;
const MAX_DICT_SIZE = 1 << 25;
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
const MATCH_MAX_LEN = MATCH_MIN_LEN + 271;
const INITIAL_OUTPUT_BYTES = 1024;
const HASH_BITS = 15;
const HASH_MASK = (1 << HASH_BITS) - 1;
const HASH_SIZE = 1 << HASH_BITS;
const MAX_CHAIN = 32;
const MAX_DISTANCE = 1 << 25;
