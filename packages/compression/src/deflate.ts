import type { Decompressor } from '@flighthq/types/contract';
import { Compression, CompressionFraming } from '@flighthq/types/contract';

import { registerDecompressor } from './decompressor';

// Dependency-free, synchronous RFC 1951 (DEFLATE) and RFC 1950 (zlib) decoding. Kept in its own module so
// the registry stays tree-shakable: a bundle that never calls `registerDeflateDecompressor` pays nothing
// for this Huffman decoder. Sync because inflate is a straight-line state machine, which keeps every
// synchronous parser that resolves through the registry synchronous too; a host with a faster native or
// wasm codec registers that instead.
//
// Real containers mix the two framings — SWF's `CWS` body and Away3D's `ByteArray.compress()` are zlib
// (a 2-byte header, the DEFLATE stream, an Adler-32), while other producers emit the bare stream. The
// caller supplies that container-owned fact explicitly because the first raw bytes can also form a valid
// zlib header. A nonzero `uncompressedLength` is a ceiling enforced while bytes are written; callers
// without one pass 0 and retain the package-wide safety cap.
export const inflateDeflate: Decompressor = (compressed, uncompressedLength, framing) => {
  const input = compressed as Uint8Array;
  let start = 0;
  let end = input.length;
  if (framing === CompressionFraming.Rfc1950) {
    if (input.length < ZLIB_HEADER_BYTES + ZLIB_TRAILER_BYTES) return null;
    const cmf = input[0];
    const flg = input[1];
    if ((cmf & 0x0f) !== 8 || cmf >> 4 > 7 || ((cmf << 8) | flg) % 31 !== 0 || (flg & 0x20) !== 0) return null;
    start = 2;
    end -= ZLIB_TRAILER_BYTES;
  } else if (framing !== CompressionFraming.Raw) return null;

  try {
    const output = rawInflate(input.subarray(0, end), start, uncompressedLength);
    if (framing === CompressionFraming.Rfc1950 && readZlibAdler32(input, end) !== computeAdler32(output)) return null;
    return output;
  } catch {
    return null;
  }
};

// Registers `inflateDeflate` for `Compression.Deflate`, which is what lets every consumer read a
// zlib-or-raw compressed body. Opt-in, so the codec is only bundled when a caller asks for it.
// Idempotent; last registration wins.
export function registerDeflateDecompressor(): void {
  registerDecompressor(Compression.Deflate, inflateDeflate);
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
  output: Uint8Array;
  outputLength = 0;

  constructor(
    readonly input: Uint8Array,
    public position: number,
    readonly outputLimit: number,
  ) {
    this.output = new Uint8Array(Math.min(INITIAL_INFLATE_BYTES, outputLimit));
  }

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
    if (this.outputLength >= this.outputLimit) throw new Error('deflate: output exceeds the inflate limit');
    if (this.outputLength >= this.output.length) {
      // Every other bound in this package is a field checked against the buffer. This one cannot be:
      // the quantity that sizes the allocation is the COMPRESSION RATIO, which is not in the file, is
      // not bounded by its length, and no per-field check can reach it. A kilobyte of nested maximum-
      // length back-references expands to gigabytes and takes the process with it — unrecoverable, and
      // reachable from any untrusted .awd. Where the file cannot bound the allocation, an explicit cap
      // has to.
      const grown = new Uint8Array(Math.min(this.output.length * 2, this.outputLimit));
      grown.set(this.output);
      this.output = grown;
    }
    this.output[this.outputLength++] = byte;
  }
}

// Inflates the raw DEFLATE block stream at `start`, returning exactly the decompressed bytes.
function rawInflate(input: Uint8Array, start: number, uncompressedLength: number): Uint8Array {
  const declaredLimit = uncompressedLength > 0 ? uncompressedLength : MAX_INFLATE_BYTES;
  const state = new InflateState(input, start, Math.min(declaredLimit, MAX_INFLATE_BYTES));
  let final = 0;
  do {
    final = state.readBit();
    const type = state.readBits(2, 0);
    if (type === 0) inflateStoredBlock(state);
    else if (type === 1) inflateHuffmanBlock(state, FIXED_LITERAL_TREE, FIXED_DISTANCE_TREE);
    else if (type === 2) inflateDynamicBlock(state);
    else throw new Error('deflate: invalid block type');
  } while (final === 0);
  return state.outputLength === state.output.length ? state.output : state.output.slice(0, state.outputLength);
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
  if (literalCount > 286) throw new Error('deflate: too many literal/length symbols');

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
      if (i + repeat > lengths.length) throw new Error('deflate: code-length repeat exceeds the declared table');
      const previous = lengths[i - 1];
      for (let r = 0; r < repeat; r++) lengths[i++] = previous;
    } else if (symbol === 17) {
      const repeat = state.readBits(3, 3);
      if (i + repeat > lengths.length) throw new Error('deflate: code-length repeat exceeds the declared table');
      for (let r = 0; r < repeat; r++) lengths[i++] = 0;
    } else {
      // The code-length alphabet has exactly symbols 0-18, so after the cases above this is 18.
      const repeat = state.readBits(7, 11);
      if (i + repeat > lengths.length) throw new Error('deflate: code-length repeat exceeds the declared table');
      for (let r = 0; r < repeat; r++) lengths[i++] = 0;
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

function computeAdler32(input: Readonly<Uint8Array>): number {
  let first = 1;
  let second = 0;
  for (const byte of input) {
    first += byte;
    if (first >= ADLER_MODULUS) first -= ADLER_MODULUS;
    second += first;
    if (second >= ADLER_MODULUS) second -= ADLER_MODULUS;
  }
  return ((second << 16) | first) >>> 0;
}

function readZlibAdler32(input: Uint8Array, offset: number): number {
  return ((input[offset] << 24) | (input[offset + 1] << 16) | (input[offset + 2] << 8) | input[offset + 3]) >>> 0;
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

// The ceiling on a single inflate. Generous for any real AWD body — a 256 MB scene is far past what
// this importer is used for — and small enough that hitting it fails a parse instead of the process.
const MAX_INFLATE_BYTES = 256 * 1024 * 1024;
const INITIAL_INFLATE_BYTES = 1024;
const ZLIB_HEADER_BYTES = 2;
const ZLIB_TRAILER_BYTES = 4;
const ADLER_MODULUS = 65521;
