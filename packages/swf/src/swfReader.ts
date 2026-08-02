// The bounded bit reader every SWF structure is written in. A reader never reads past `end`; it sets
// `valid` to false and returns zero instead, so a caller checks `valid` once after a group of reads
// rather than testing each one. Bit reads are big-endian within a byte and byte reads are little-endian,
// which is the format's own split.
export class SwfReader {
  bitPosition = 0;
  pos: number;
  valid = true;

  constructor(
    readonly source: Uint8Array,
    start: number,
    readonly end: number,
  ) {
    this.pos = start;
  }

  alignToByte(): void {
    if (this.bitPosition === 0) return;
    this.bitPosition = 0;
    this.pos++;
  }

  // SWF EncodedU32: seven value bits per byte, least significant group first, at most five bytes.
  readEncodedUint32(): number {
    let value = 0;
    for (let i = 0; i < ENCODED_UINT32_MAX_BYTES; i++) {
      const byte = this.readUint8();
      value += (byte & 0x7f) * 2 ** (7 * i);
      if ((byte & 0x80) === 0) break;
    }
    return value;
  }

  // FIXED8: a signed 8.8 fixed-point value, used for miter limits and gradient focal points.
  readFixed8(): number {
    const value = this.readUint16();
    return (value >= 0x8000 ? value - 0x10000 : value) / FIXED_8_8_ONE;
  }

  readSignedBits(count: number): number {
    const value = this.readUnsignedBits(count);
    if (count === 0) return 0;
    const sign = 2 ** (count - 1);
    return value >= sign ? value - 2 ** count : value;
  }

  readString(): string {
    this.alignToByte();
    const start = this.pos;
    while (this.pos < this.end && this.source[this.pos] !== 0) this.pos++;
    if (this.pos >= this.end) {
      this.valid = false;
      return '';
    }
    const value = _decoder.decode(this.source.subarray(start, this.pos));
    this.pos++;
    return value;
  }

  readUint8(): number {
    this.alignToByte();
    if (this.pos >= this.end) {
      this.valid = false;
      return 0;
    }
    return this.source[this.pos++];
  }

  readUint16(): number {
    const low = this.readUint8();
    const high = this.readUint8();
    return low + high * 0x100;
  }

  readUint32(): number {
    const low = this.readUint16();
    const high = this.readUint16();
    return low + high * 0x10000;
  }

  readUnsignedBits(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) {
      if (this.pos >= this.end) {
        this.valid = false;
        return 0;
      }
      value = value * 2 + ((this.source[this.pos] >> (7 - this.bitPosition)) & 1);
      this.bitPosition++;
      if (this.bitPosition === 8) {
        this.bitPosition = 0;
        this.pos++;
      }
    }
    return value;
  }
}

const ENCODED_UINT32_MAX_BYTES = 5;
const FIXED_8_8_ONE = 0x100;
const _decoder = new TextDecoder();
