import type { AwdDecompressor } from '@flighthq/types';

import { registerAwdDecompressor } from './awdParse';
import { AWD_COMPRESSION_DEFLATE } from './awdSchema';

// Vendored, dependency-free, synchronous DEFLATE/zlib inflater used as the default AWD decompressor.
// Away3D's exporter compresses the AWD body with `ByteArray.compress()` (zlib format: a 2-byte header,
// a raw DEFLATE stream, then a 4-byte Adler-32), so `inflateAwdDeflate` accepts a zlib-wrapped stream and
// transparently falls back to treating the input as headerless raw DEFLATE. It is kept in its own module
// so `registerAwdDecompressor`'s opt-in registry stays tree-shakable — a bundle that never calls
// `registerAwdDeflateDecompressor` pays nothing for this ~200 lines of Huffman decoding.
//
// The seam is deliberately sync (RFC 1951/1950 inflate is a straight-line state machine) so the existing
// synchronous `parseAwd` keeps working; a host with a faster native codec can register its own instead.

// Inflates a zlib-wrapped or raw DEFLATE stream, returning the decompressed bytes or null on any malformed
// input (bad Huffman table, back-reference past the output start, truncated stream). Typed as an
// AwdDecompressor so it can be handed straight to registerAwdDecompressor.
export const inflateAwdDeflate: AwdDecompressor = (compressed) => {
  const input = compressed as Uint8Array;
  // Detect a zlib header: low nibble of CMF is the compression method (8 = deflate) and the 16-bit
  // (CMF,FLG) big-endian value is a multiple of 31. A preset dictionary (FDICT) is not supported.
  let start = 0;
  if (input.length >= 2 && (input[0] & 0x0f) === 8 && (((input[0] << 8) | input[1]) & 0xffff) % 31 === 0) {
    if ((input[1] & 0x20) !== 0) return null; // FDICT preset dictionary — unsupported
    start = 2;
  }
  try {
    return rawInflate(input, start);
  } catch {
    return null;
  }
};

// Registers `inflateAwdDeflate` as the decompressor for AWD_COMPRESSION_DEFLATE, enabling
// `parseAwd`/`parseAwdSkeletonAnimations` to import Away3D's default (compressed) AWD exports. Opt-in so
// the codec is only bundled when a caller asks for it. Idempotent; last registration wins.
export function registerAwdDeflateDecompressor(): void {
  registerAwdDecompressor(AWD_COMPRESSION_DEFLATE, inflateAwdDeflate);
}

// RFC 1951 length codes 257-285: the base copy length and the number of extra bits that follow.
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];

// RFC 1951 distance codes 0-29: the base back-distance and the number of extra bits that follow.
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

// The order in which the 19 code-length-code lengths are written in a dynamic-Huffman block header.
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// A canonical Huffman decode table built from per-symbol code lengths (tinf-style): `counts[len]` is how
// many symbols use a code of that bit length, and `symbols` lists symbols ordered by (length, symbol).
interface HuffmanTree {
  counts: number[];
  symbols: number[];
}

// An LSB-first bit reader over the DEFLATE stream, plus the growable output buffer. Throwing on overrun
// keeps the decode a straight line; inflateAwdDeflate turns the throw into a null return.
class InflateState {
  bitBuffer = 0;
  bitCount = 0;
  output = new Uint8Array(1024);
  outputLength = 0;

  constructor(
    readonly input: Uint8Array,
    public position: number,
  ) {}

  readBit(): number {
    if (this.bitCount === 0) {
      if (this.position >= this.input.length) throw new Error('deflate: read past end of stream');
      this.bitBuffer = this.input[this.position++];
      this.bitCount = 8;
    }
    const bit = this.bitBuffer & 1;
    this.bitBuffer >>= 1;
    this.bitCount--;
    return bit;
  }

  readBits(count: number, base: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) value |= this.readBit() << i;
    return value + base;
  }

  writeByte(byte: number): void {
    if (this.outputLength >= this.output.length) {
      const grown = new Uint8Array(this.output.length * 2);
      grown.set(this.output);
      this.output = grown;
    }
    this.output[this.outputLength++] = byte;
  }
}

// Inflates the raw DEFLATE block stream at `start`, returning exactly the decompressed bytes.
function rawInflate(input: Uint8Array, start: number): Uint8Array {
  const state = new InflateState(input, start);
  let final = 0;
  do {
    final = state.readBit();
    const type = state.readBits(2, 0);
    if (type === 0) inflateStoredBlock(state);
    else if (type === 1) inflateHuffmanBlock(state, FIXED_LITERAL_TREE, FIXED_DISTANCE_TREE);
    else if (type === 2) inflateDynamicBlock(state);
    else throw new Error('deflate: invalid block type');
  } while (final === 0);
  return state.output.slice(0, state.outputLength);
}

// A stored (uncompressed) block: align to the next byte, read the 16-bit LEN and its one's-complement
// NLEN, then copy LEN literal bytes.
function inflateStoredBlock(state: InflateState): void {
  state.bitBuffer = 0;
  state.bitCount = 0;
  if (state.position + 4 > state.input.length) throw new Error('deflate: truncated stored block header');
  const len = state.input[state.position] | (state.input[state.position + 1] << 8);
  const nlen = state.input[state.position + 2] | (state.input[state.position + 3] << 8);
  state.position += 4;
  if ((len ^ 0xffff) !== nlen) throw new Error('deflate: stored block length mismatch');
  if (state.position + len > state.input.length) throw new Error('deflate: truncated stored block data');
  for (let i = 0; i < len; i++) state.writeByte(state.input[state.position++]);
}

// Decodes one Huffman-coded block against the given literal/length and distance trees, emitting literals
// and resolving <length, distance> back-references against the bytes already written.
function inflateHuffmanBlock(state: InflateState, literalTree: HuffmanTree, distanceTree: HuffmanTree): void {
  for (;;) {
    const symbol = decodeSymbol(state, literalTree);
    if (symbol === 256) return; // end of block
    if (symbol < 256) {
      state.writeByte(symbol);
      continue;
    }
    const lengthIndex = symbol - 257;
    if (lengthIndex >= LENGTH_BASE.length) throw new Error('deflate: invalid length symbol');
    const length = state.readBits(LENGTH_EXTRA[lengthIndex], LENGTH_BASE[lengthIndex]);
    const distanceSymbol = decodeSymbol(state, distanceTree);
    if (distanceSymbol >= DISTANCE_BASE.length) throw new Error('deflate: invalid distance symbol');
    const distance = state.readBits(DISTANCE_EXTRA[distanceSymbol], DISTANCE_BASE[distanceSymbol]);
    let source = state.outputLength - distance;
    if (source < 0) throw new Error('deflate: back-reference before start of output');
    for (let i = 0; i < length; i++) state.writeByte(state.output[source++]);
  }
}

// Builds the dynamic literal/length and distance Huffman trees from the block header (their code lengths
// are themselves Huffman-coded by a code-length code), then decodes the block.
function inflateDynamicBlock(state: InflateState): void {
  const literalCount = state.readBits(5, 257);
  const distanceCount = state.readBits(5, 1);
  const codeLengthCount = state.readBits(4, 4);

  const codeLengthLengths = new Array<number>(19).fill(0);
  for (let i = 0; i < codeLengthCount; i++) codeLengthLengths[CODE_LENGTH_ORDER[i]] = state.readBits(3, 0);
  const codeLengthTree = buildHuffmanTree(codeLengthLengths, 19);

  // Decode the literal+distance code lengths as one run, honoring the repeat codes 16 (copy previous
  // 3-6×), 17 (zero 3-10×), and 18 (zero 11-138×).
  const lengths = new Array<number>(literalCount + distanceCount).fill(0);
  let i = 0;
  while (i < lengths.length) {
    const symbol = decodeSymbol(state, codeLengthTree);
    if (symbol < 16) {
      lengths[i++] = symbol;
    } else if (symbol === 16) {
      if (i === 0) throw new Error('deflate: repeat with no previous length');
      const repeat = state.readBits(2, 3);
      const previous = lengths[i - 1];
      for (let r = 0; r < repeat && i < lengths.length; r++) lengths[i++] = previous;
    } else if (symbol === 17) {
      const repeat = state.readBits(3, 3);
      for (let r = 0; r < repeat && i < lengths.length; r++) lengths[i++] = 0;
    } else if (symbol === 18) {
      const repeat = state.readBits(7, 11);
      for (let r = 0; r < repeat && i < lengths.length; r++) lengths[i++] = 0;
    } else {
      throw new Error('deflate: invalid code-length symbol');
    }
  }

  const literalTree = buildHuffmanTree(lengths.slice(0, literalCount), literalCount);
  const distanceTree = buildHuffmanTree(lengths.slice(literalCount), distanceCount);
  inflateHuffmanBlock(state, literalTree, distanceTree);
}

// Builds a canonical Huffman decode tree from per-symbol code lengths (0 = unused). Symbols are bucketed
// by length so decodeSymbol can walk the code space one bit at a time.
function buildHuffmanTree(lengths: readonly number[], count: number): HuffmanTree {
  const counts = new Array<number>(16).fill(0);
  for (let i = 0; i < count; i++) counts[lengths[i]]++;
  counts[0] = 0;

  const offsets = new Array<number>(16).fill(0);
  for (let len = 1; len < 16; len++) offsets[len] = offsets[len - 1] + counts[len - 1];

  const symbols = new Array<number>(count).fill(0);
  for (let i = 0; i < count; i++) {
    if (lengths[i] !== 0) symbols[offsets[lengths[i]]++] = i;
  }
  return { counts, symbols };
}

// Reads bits until they identify one canonical Huffman symbol (the tinf decode: extend the code one bit
// at a time, subtracting each length's code count until the code falls within a bucket).
function decodeSymbol(state: InflateState, tree: HuffmanTree): number {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let len = 1; len < 16; len++) {
    code |= state.readBit();
    const count = tree.counts[len];
    if (code - first < count) return tree.symbols[index + (code - first)];
    index += count;
    first += count;
    first <<= 1;
    code <<= 1;
  }
  throw new Error('deflate: invalid Huffman code');
}

// The RFC 1951 fixed Huffman trees: literals/lengths 0-287 (lengths 8/9/7/8 by range) and 5-bit distances.
const FIXED_LITERAL_TREE = buildFixedLiteralTree();
const FIXED_DISTANCE_TREE = buildHuffmanTree(new Array<number>(30).fill(5), 30);

function buildFixedLiteralTree(): HuffmanTree {
  const lengths = new Array<number>(288);
  for (let i = 0; i < 144; i++) lengths[i] = 8;
  for (let i = 144; i < 256; i++) lengths[i] = 9;
  for (let i = 256; i < 280; i++) lengths[i] = 7;
  for (let i = 280; i < 288; i++) lengths[i] = 8;
  return buildHuffmanTree(lengths, 288);
}
