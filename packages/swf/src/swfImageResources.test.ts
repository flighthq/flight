// @vitest-environment jsdom
import { getNodeChildren } from '@flighthq/node/contract';
import { loadScene2DImageResources } from '@flighthq/scene2d-resources/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type { Image, Shape, Texture2D, TextureSource } from '@flighthq/types/contract';
import {
  ImageResourceReferenceKind,
  ImageTextureSourceKind,
  ResourceResolutionState,
  ShapeKind,
} from '@flighthq/types/contract';

import { createScene2DFromSwf } from './swfDocument';
import { ShapeWriter } from './swfShapeTestHelper';

beforeEach(() => {
  // jsdom has the browser image surface but does not decode image bytes. Keep the production Blob ->
  // HTMLImageElement path intact and model the dimensions a real decode of this 1x1 PNG supplies.
  HTMLImageElement.prototype.decode = vi.fn(function (this: HTMLImageElement) {
    this.width = 1;
    this.height = 1;
    return Promise.resolve();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
});

describe('SWF image resources', () => {
  it('decodes an embedded PNG and binds its pixels to the bitmap-fill texture', async () => {
    const imageBytes = decodeBase64(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    );
    const document = createScene2DFromSwf(createBitmapFillSwf(imageBytes))!;
    const shape = getNodeChildren(document.root)[0] as Shape;
    const texture = shape.data.commands[2] as Texture2D;
    const reference = document.imageResources[0];

    expect(shape.kind).toBe(ShapeKind);
    expect(shape.data.commands[0]).toBe('beginTextureFill');
    expect(reference.kind).toBe(ImageResourceReferenceKind.Embedded);
    if (reference.kind !== ImageResourceReferenceKind.Embedded) throw new Error('Expected embedded image resource');
    expect(reference.mimeType).toBe('image/png');
    expect(reference.bytes).toEqual(imageBytes);
    expect(reference.textures).toEqual([texture]);
    expect(getTextureSource(texture)).toBeNull();

    const resources = await loadScene2DImageResources(document);
    const image = getTextureSource(texture);

    expect(resources.resolved).toEqual([reference]);
    expect(resources.unresolved).toEqual([]);
    expect(reference.state).toBe(ResourceResolutionState.Resolved);
    expect(image?.kind).toBe(ImageTextureSourceKind);
    if (!isImageTextureSource(image)) throw new Error('Expected decoded image source');
    expect(image.width).toBe(1);
    expect(image.height).toBe(1);
    expect(image.source).toBeInstanceOf(HTMLImageElement);
    expect(HTMLImageElement.prototype.decode).toHaveBeenCalledOnce();
    expect(getTextureSource(reference.textures![0])).toBe(image);
  });
});

function isImageTextureSource(source: Readonly<TextureSource> | null): source is Image {
  return source?.kind === ImageTextureSourceKind;
}

function createBitmapFillSwf(imageBytes: Uint8Array): Uint8Array {
  const art = new ShapeWriter();
  art.writeFillStyleCount(1);
  art.writeBitmapFillStyle(0x41, IMAGE_CHARACTER_ID, 20);
  art.writeLineStyleCount(0);
  art.writeStyleBits(1, 0);
  art.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
  art.writeStraightEdge(20, 0);
  art.writeStraightEdge(0, 20);
  art.writeStraightEdge(-20, 0);
  art.writeStraightEdge(0, -20);
  art.writeEndShape();

  return createSwf([
    createTag(TAG_DEFINE_BITS_JPEG_2, joinBytes(uint16(IMAGE_CHARACTER_ID), imageBytes)),
    createTag(TAG_DEFINE_SHAPE_3, joinBytes(uint16(SHAPE_CHARACTER_ID), createRectangle(0, 20, 0, 20), art.toBytes())),
    createTag(
      TAG_PLACE_OBJECT_2,
      joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(SHAPE_CHARACTER_ID)),
    ),
    createTag(TAG_SHOW_FRAME),
    createTag(TAG_END),
  ]);
}

function createRectangle(xMin: number, xMax: number, yMin: number, yMax: number): Uint8Array {
  const values = [xMin, xMax, yMin, yMax];
  const bits = signedBitCount(values);
  const writer = new BitWriter();
  writer.writeUnsigned(bits, 5);
  for (const value of values) writer.writeSigned(value, bits);
  return writer.toBytes();
}

function createSwf(tags: ReadonlyArray<Uint8Array>): Uint8Array {
  const body = joinBytes(createRectangle(0, 20, 0, 20), uint16(24 * 256), uint16(1), ...tags);
  return joinBytes(new Uint8Array([0x46, 0x57, 0x53, 9]), uint32(SWF_PREFIX_LENGTH + body.length), body);
}

function createTag(code: number, body: Uint8Array = new Uint8Array()): Uint8Array {
  const shortLength = body.length < 0x3f ? body.length : 0x3f;
  const header = uint16((code << 6) | shortLength);
  return shortLength === 0x3f ? joinBytes(header, uint32(body.length), body) : joinBytes(header, body);
}

function joinBytes(...parts: ReadonlyArray<Uint8Array>): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function signedBitCount(values: ReadonlyArray<number>): number {
  for (let bits = 1; bits < 32; bits++) {
    const minimum = -(2 ** (bits - 1));
    const maximum = 2 ** (bits - 1) - 1;
    if (values.every((value) => value >= minimum && value <= maximum)) return bits;
  }
  return 32;
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]);
}

class BitWriter {
  private readonly bits: number[] = [];

  toBytes(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));
    for (let index = 0; index < this.bits.length; index++) {
      bytes[Math.floor(index / 8)] |= this.bits[index] << (7 - (index % 8));
    }
    return bytes;
  }

  writeSigned(value: number, count: number): void {
    this.writeUnsigned(value < 0 ? value + 2 ** count : value, count);
  }

  writeUnsigned(value: number, count: number): void {
    for (let index = count - 1; index >= 0; index--) this.bits.push(Math.floor(value / 2 ** index) & 1);
  }
}

const IMAGE_CHARACTER_ID = 9;
const PLACE_HAS_CHARACTER = 0x02;
const SHAPE_CHARACTER_ID = 7;
const SWF_PREFIX_LENGTH = 8;
const TAG_DEFINE_BITS_JPEG_2 = 21;
const TAG_DEFINE_SHAPE_3 = 32;
const TAG_END = 0;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_SHOW_FRAME = 1;
