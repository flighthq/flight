import { getNodeLocalMatrix } from '@flighthq/node/contract';
import {
  createScene2DDocumentFromBytes,
  createScene2DDocumentImporterRegistry,
} from '@flighthq/scene2d-resources/contract';

import { createScene2DFromSwf, registerSwfScene2DDocumentImporter } from './swfDocument';

describe('createScene2DFromSwf', () => {
  it('imports a named PlaceObject2 as a transformed slot with SymbolClass linkage', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_FILE_ATTRIBUTES, new Uint8Array(4)),
        createTag(TAG_SYMBOL_CLASS, joinBytes(uint16(1), uint16(7), swfString('Game.Avatar'))),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_MATRIX | PLACE_HAS_CHARACTER]),
            uint16(3),
            uint16(7),
            createMatrix(1.5, 0.25, -0.125, 0.5, 200, -40),
            swfString('avatarSlot'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document?.sourceKind).toBe('swf');
    expect(document?.references).toHaveLength(1);
    const reference = document!.references[0];
    expect(reference.kind).toBe('Slot');
    expect(reference.name).toBe('avatarSlot');
    expect(reference.kind === 'Slot' ? reference.linkage : null).toBe('Game.Avatar');
    expect(reference.target.name).toBe('avatarSlot');

    const matrix = getNodeLocalMatrix(reference.target);
    expect(matrix.a).toBeCloseTo(1.5);
    expect(matrix.b).toBeCloseTo(0.25);
    expect(matrix.c).toBeCloseTo(-0.125);
    expect(matrix.d).toBeCloseTo(0.5);
    expect(matrix.tx).toBeCloseTo(10);
    expect(matrix.ty).toBeCloseTo(-2);
  });

  it('uses a PlaceObject3 class name as direct slot linkage', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_3,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_MATRIX | PLACE_HAS_CHARACTER, PLACE_HAS_CLASS_NAME]),
            uint16(1),
            swfString('Game.ExternalAvatar'),
            uint16(9),
            createMatrix(1, 0, 0, 1, 0, 0),
            swfString('externalSlot'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const reference = document?.references[0];
    expect(reference?.kind).toBe('Slot');
    expect(reference?.kind === 'Slot' ? reference.linkage : null).toBe('Game.ExternalAvatar');
  });

  it('rejects compressed and truncated inputs without throwing', () => {
    const compressed = createSwf([createTag(TAG_END)]);
    compressed[0] = 0x43;
    expect(createScene2DFromSwf(compressed)).toBeNull();
    expect(createScene2DFromSwf(new Uint8Array([0x46, 0x57, 0x53]))).toBeNull();
    expect(createScene2DFromSwf(createSwf([]))).toBeNull();
  });
});

describe('registerSwfScene2DDocumentImporter', () => {
  it('adds an opt-in SWF codec without global registration', () => {
    const registry = createScene2DDocumentImporterRegistry();
    const source = createSwf([createTag(TAG_END)]);
    expect(createScene2DDocumentFromBytes(source, registry)).toBeNull();

    registerSwfScene2DDocumentImporter(registry);

    expect(createScene2DDocumentFromBytes(source, registry)?.sourceKind).toBe('swf');
  });
});

class BitWriter {
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

function createMatrix(a: number, b: number, c: number, d: number, tx: number, ty: number): Uint8Array {
  const writer = new BitWriter();
  const scales = [Math.round(a * FIXED_16_ONE), Math.round(d * FIXED_16_ONE)];
  const rotates = [Math.round(b * FIXED_16_ONE), Math.round(c * FIXED_16_ONE)];
  const scaleBits = signedBitCount(scales);
  const rotateBits = signedBitCount(rotates);
  const translateBits = signedBitCount([tx, ty]);

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

function createRectangle(xMin: number, xMax: number, yMin: number, yMax: number): Uint8Array {
  const writer = new BitWriter();
  const values = [xMin, xMax, yMin, yMax];
  const bits = signedBitCount(values);
  writer.writeUnsigned(bits, 5);
  for (const value of values) writer.writeSigned(value, bits);
  return writer.toBytes();
}

function createSwf(tags: ReadonlyArray<Uint8Array>): Uint8Array {
  const body = joinBytes(createRectangle(0, 2000, 0, 1000), uint16(24 * 256), uint16(1), ...tags);
  const fileLength = SWF_PREFIX_LENGTH + body.length;
  return joinBytes(new Uint8Array([0x46, 0x57, 0x53, 9]), uint32(fileLength), body);
}

function createTag(code: number, body: Uint8Array = new Uint8Array()): Uint8Array {
  const shortLength = body.length < 0x3f ? body.length : 0x3f;
  const header = uint16((code << 6) | shortLength);
  return shortLength === 0x3f ? joinBytes(header, uint32(body.length), body) : joinBytes(header, body);
}

function joinBytes(...parts: ReadonlyArray<Uint8Array>): Uint8Array {
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

function signedBitCount(values: ReadonlyArray<number>): number {
  for (let bits = 1; bits < 32; bits++) {
    const minimum = -(2 ** (bits - 1));
    const maximum = 2 ** (bits - 1) - 1;
    if (values.every((value) => value >= minimum && value <= maximum)) return bits;
  }
  return 32;
}

function swfString(value: string): Uint8Array {
  return joinBytes(_encoder.encode(value), new Uint8Array([0]));
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]);
}

const FIXED_16_ONE = 0x10000;
const PLACE_HAS_CHARACTER = 0x02;
const PLACE_HAS_CLASS_NAME = 0x08;
const PLACE_HAS_MATRIX = 0x04;
const PLACE_HAS_NAME = 0x20;
const SWF_PREFIX_LENGTH = 8;
const TAG_END = 0;
const TAG_FILE_ATTRIBUTES = 69;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_PLACE_OBJECT_3 = 70;
const TAG_SHOW_FRAME = 1;
const TAG_SYMBOL_CLASS = 76;
const _encoder = new TextEncoder();
