import { computeAdler32, DISTANCE_BASE, DISTANCE_EXTRA, LENGTH_BASE, LENGTH_EXTRA } from './deflateFormat';

// Dependency-free, synchronous RFC 1951 (DEFLATE) and RFC 1950 (zlib) encoding, in its own module so a
// bundle that only reads compressed bytes never carries an encoder and vice versa. Written from the
// format's own rules — the code tables it shares with the decoder are in deflateFormat.
//
// One fixed-Huffman block over the whole input, with greedy LZ77 matching through a hash chain. Fixed
// rather than dynamic Huffman because a dynamic block must also encode its own code lengths, which buys
// a further few percent for a large amount of code; fixed already collapses the repetition that makes
// containers worth compressing. When the encoded block would be larger than the bytes themselves — which
// is what incompressible input does — stored blocks are emitted instead, so compressing never meaningfully
// grows a payload. Output is a pure function of the input: no timestamps, no heuristics that vary.

// Raw RFC 1951: the DEFLATE stream alone, with no wrapper. This is the framing `inflateDeflate` reads as
// CompressionFraming.Raw.
export function compressDeflate(bytes: Readonly<Uint8Array>): Uint8Array {
  const input = bytes as Uint8Array;
  const huffman = encodeFixedHuffmanBlock(input);
  return huffman.length <= storedLength(input.length) ? huffman : encodeStoredBlocks(input);
}

// RFC 1950: a two-byte header, the same DEFLATE stream, and an Adler-32 of the UNCOMPRESSED bytes, in
// big-endian order. This is the framing `inflateDeflate` reads as CompressionFraming.Rfc1950.
export function compressDeflateZlib(bytes: Readonly<Uint8Array>): Uint8Array {
  const deflated = compressDeflate(bytes);
  const out = new Uint8Array(ZLIB_HEADER_BYTES + deflated.length + ZLIB_TRAILER_BYTES);
  out[0] = ZLIB_CMF;
  out[1] = ZLIB_FLG;
  out.set(deflated, ZLIB_HEADER_BYTES);
  const checksum = computeAdler32(bytes);
  const trailer = ZLIB_HEADER_BYTES + deflated.length;
  out[trailer] = (checksum >>> 24) & 0xff;
  out[trailer + 1] = (checksum >>> 16) & 0xff;
  out[trailer + 2] = (checksum >>> 8) & 0xff;
  out[trailer + 3] = checksum & 0xff;
  return out;
}

// Bit order is the format's, not one convention throughout: block headers and extra bits are packed
// least-significant-bit first, while a Huffman code is packed most-significant-bit first. Mixing the two
// up produces a stream that still decodes for short inputs and fails on long ones.
class DeflateBitWriter {
  private bitCount = 0;
  private bitBuffer = 0;
  private bytes: Uint8Array = new Uint8Array(INITIAL_OUTPUT_BYTES);
  private length = 0;

  writeBits(value: number, count: number): void {
    for (let i = 0; i < count; i++) this.writeBit((value >>> i) & 1);
  }

  writeCode(code: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) this.writeBit((code >>> i) & 1);
  }

  alignToByte(): void {
    if (this.bitCount !== 0) {
      this.push(this.bitBuffer);
      this.bitBuffer = 0;
      this.bitCount = 0;
    }
  }

  writeByte(value: number): void {
    this.push(value);
  }

  finish(): Uint8Array {
    this.alignToByte();
    return this.bytes.slice(0, this.length);
  }

  get byteLength(): number {
    return this.length + (this.bitCount === 0 ? 0 : 1);
  }

  private writeBit(bit: number): void {
    this.bitBuffer |= bit << this.bitCount;
    this.bitCount++;
    if (this.bitCount === 8) {
      this.push(this.bitBuffer);
      this.bitBuffer = 0;
      this.bitCount = 0;
    }
  }

  private push(value: number): void {
    if (this.length === this.bytes.length) {
      const grown = new Uint8Array(this.bytes.length * 2);
      grown.set(this.bytes);
      this.bytes = grown;
    }
    this.bytes[this.length++] = value;
  }
}

function encodeFixedHuffmanBlock(input: Uint8Array): Uint8Array {
  const writer = new DeflateBitWriter();
  writer.writeBits(1, 1);
  writer.writeBits(FIXED_HUFFMAN_BLOCK, 2);

  // Hash chain over three-byte prefixes: `head` is the most recent position for a prefix and `previous`
  // links each position to the one before it, so a match search walks candidates newest-first and can be
  // cut off by depth rather than scanning the window.
  const head = new Int32Array(HASH_SIZE).fill(-1);
  const previous = new Int32Array(input.length).fill(-1);

  let position = 0;
  while (position < input.length) {
    let matchLength = 0;
    let matchDistance = 0;
    if (position + MIN_MATCH <= input.length) {
      const key = hashAt(input, position);
      let candidate = head[key];
      let attempts = 0;
      while (candidate >= 0 && attempts < MAX_CHAIN) {
        const distance = position - candidate;
        if (distance > MAX_DISTANCE) break;
        const length = matchRunLength(input, candidate, position);
        if (length > matchLength) {
          matchLength = length;
          matchDistance = distance;
          if (length === MAX_MATCH) break;
        }
        candidate = previous[candidate];
        attempts++;
      }
      previous[position] = head[key];
      head[key] = position;
    }

    if (matchLength >= MIN_MATCH) {
      writeLengthSymbol(writer, matchLength);
      writeDistanceSymbol(writer, matchDistance);
      // Positions inside the match still enter the chain, so a later repeat that begins mid-match is
      // findable. This is a ratio optimisation, not a correctness requirement — the stream decodes
      // either way — and it is worth roughly a fifth of the output on repetitive input (measured:
      // 14000 bytes of mixed text encode to 168 with it and 212 without). Deliberately not pinned by
      // a test: an assertion tight enough to detect it would pin a heuristic, not a behaviour.
      for (let i = 1; i < matchLength; i++) {
        const inner = position + i;
        if (inner + MIN_MATCH <= input.length) {
          const key = hashAt(input, inner);
          previous[inner] = head[key];
          head[key] = inner;
        }
      }
      position += matchLength;
      continue;
    }

    writeLiteralSymbol(writer, input[position]);
    position++;
  }

  writeLiteralSymbol(writer, END_OF_BLOCK);
  return writer.finish();
}

// Type-00 blocks: a byte-aligned length and its one's complement, then the bytes verbatim. Each block
// carries at most 65535 bytes, so a long input needs several.
function encodeStoredBlocks(input: Uint8Array): Uint8Array {
  const writer = new DeflateBitWriter();
  let offset = 0;
  do {
    const size = Math.min(STORED_BLOCK_MAX, input.length - offset);
    const final = offset + size >= input.length ? 1 : 0;
    writer.writeBits(final, 1);
    writer.writeBits(STORED_BLOCK, 2);
    writer.alignToByte();
    writer.writeByte(size & 0xff);
    writer.writeByte((size >>> 8) & 0xff);
    writer.writeByte(~size & 0xff);
    writer.writeByte((~size >>> 8) & 0xff);
    for (let i = 0; i < size; i++) writer.writeByte(input[offset + i]);
    offset += size;
  } while (offset < input.length);
  return writer.finish();
}

function storedLength(inputLength: number): number {
  const blocks = Math.max(1, Math.ceil(inputLength / STORED_BLOCK_MAX));
  return blocks * STORED_BLOCK_OVERHEAD + inputLength;
}

// The fixed literal/length alphabet changes code width three times across its range; the boundaries are
// the format's, and getting one wrong yields a stream that decodes correctly only below it.
function writeLiteralSymbol(writer: DeflateBitWriter, symbol: number): void {
  if (symbol <= 143) {
    writer.writeCode(0x30 + symbol, 8);
  } else if (symbol <= 255) {
    writer.writeCode(0x190 + symbol - 144, 9);
  } else if (symbol <= 279) {
    writer.writeCode(symbol - 256, 7);
  } else {
    writer.writeCode(0xc0 + symbol - 280, 8);
  }
}

function writeLengthSymbol(writer: DeflateBitWriter, length: number): void {
  let index = LENGTH_BASE.length - 1;
  while (index > 0 && LENGTH_BASE[index] > length) index--;
  writeLiteralSymbol(writer, FIRST_LENGTH_SYMBOL + index);
  writer.writeBits(length - LENGTH_BASE[index], LENGTH_EXTRA[index]);
}

function writeDistanceSymbol(writer: DeflateBitWriter, distance: number): void {
  let index = DISTANCE_BASE.length - 1;
  while (index > 0 && DISTANCE_BASE[index] > distance) index--;
  writer.writeCode(index, 5);
  writer.writeBits(distance - DISTANCE_BASE[index], DISTANCE_EXTRA[index]);
}

function matchRunLength(input: Uint8Array, candidate: number, position: number): number {
  const limit = Math.min(input.length - position, MAX_MATCH);
  let length = 0;
  while (length < limit && input[candidate + length] === input[position + length]) length++;
  return length;
}

function hashAt(input: Uint8Array, position: number): number {
  return ((input[position] << 10) ^ (input[position + 1] << 5) ^ input[position + 2]) & HASH_MASK;
}

const END_OF_BLOCK = 256;
const FIRST_LENGTH_SYMBOL = 257;
const FIXED_HUFFMAN_BLOCK = 1;
const HASH_BITS = 15;
const HASH_MASK = (1 << HASH_BITS) - 1;
const HASH_SIZE = 1 << HASH_BITS;
const INITIAL_OUTPUT_BYTES = 1024;
const MAX_CHAIN = 32;
const MAX_DISTANCE = 32768;
const MAX_MATCH = 258;
const MIN_MATCH = 3;
const STORED_BLOCK = 0;
const STORED_BLOCK_MAX = 65535;
const STORED_BLOCK_OVERHEAD = 5;
const ZLIB_CMF = 0x78;
const ZLIB_FLG = 0x01;
const ZLIB_HEADER_BYTES = 2;
const ZLIB_TRAILER_BYTES = 4;
