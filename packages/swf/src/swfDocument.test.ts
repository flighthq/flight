import {
  getNodeLocalBoundsRectangle,
  getNodeLocalMatrix,
  getNodeParent,
  getNodeWorldMatrix,
} from '@flighthq/node/contract';
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
    expect(getNodeLocalBoundsRectangle(document!.root)).toMatchObject({ height: 50, width: 100, x: 0, y: 0 });
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

  it('updates an existing PlaceObject2 when the move flag is set', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_SYMBOL_CLASS, joinBytes(uint16(1), uint16(7), swfString('Game.Avatar'))),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_MATRIX | PLACE_HAS_CHARACTER]),
            uint16(3),
            uint16(7),
            createMatrix(1, 0, 0, 1, 0, 0),
            swfString('avatarSlot'),
          ),
        ),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_MOVE | PLACE_HAS_MATRIX]), uint16(3), createMatrix(2, 0, 0, 3, 40, -60)),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const reference = document?.references[0];
    expect(reference?.name).toBe('avatarSlot');
    expect(reference?.kind === 'Slot' ? reference.linkage : null).toBe('Game.Avatar');
    expect(getNodeLocalMatrix(reference!.target)).toMatchObject({ a: 2, d: 3, tx: 2, ty: -3 });
  });

  it('does not inherit stale fields for a fresh placement at an occupied depth', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
            uint16(3),
            uint16(7),
            swfString('staleSlot'),
          ),
        ),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(3), uint16(8))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document?.references).toEqual([]);
  });

  it('ignores a PlaceObject3 move with no display-list target', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_3,
          joinBytes(
            new Uint8Array([PLACE_MOVE | PLACE_HAS_NAME, PLACE_HAS_CLASS_NAME]),
            uint16(1),
            swfString('Game.Ghost'),
            swfString('ghostSlot'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document?.references).toEqual([]);
  });

  it('keeps the first-frame snapshot isolated from later mutations', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
            uint16(1),
            uint16(7),
            swfString('firstFrameSlot'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_REMOVE_OBJECT_2, uint16(1)),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
            uint16(2),
            uint16(8),
            swfString('secondFrameSlot'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document?.references.map((reference) => reference.name)).toEqual(['firstFrameSlot']);
  });

  it('uses a PlaceObject4 class name as direct slot linkage while ignoring later metadata', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_4,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_MATRIX | PLACE_HAS_CHARACTER, PLACE_HAS_CLASS_NAME]),
            uint16(1),
            swfString('Game.MetadataAvatar'),
            uint16(9),
            createMatrix(1, 0, 0, 1, 60, 80),
            swfString('metadataSlot'),
            new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const reference = document?.references[0];
    expect(reference?.name).toBe('metadataSlot');
    expect(reference?.kind === 'Slot' ? reference.linkage : null).toBe('Game.MetadataAvatar');
    expect(getNodeLocalMatrix(reference!.target)).toMatchObject({ tx: 3, ty: 4 });
  });

  it('uses legacy PlaceObject transforms to import named descendants from a sprite', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(0, 200, 0, 100))),
        createTag(
          TAG_DEFINE_SPRITE,
          joinBytes(
            uint16(20),
            uint16(1),
            createTag(
              TAG_PLACE_OBJECT_2,
              joinBytes(
                new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
                uint16(2),
                uint16(7),
                swfString('legacyChild'),
              ),
            ),
            createTag(TAG_SHOW_FRAME),
            createTag(TAG_END),
          ),
        ),
        createTag(TAG_SYMBOL_CLASS, joinBytes(uint16(1), uint16(7), swfString('Game.LegacyChild'))),
        createTag(
          TAG_PLACE_OBJECT,
          joinBytes(uint16(20), uint16(1), createMatrix(2, 0, 0, 3, 100, -40), createLegacyColorTransform()),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const reference = document?.references[0];
    expect(reference?.name).toBe('legacyChild');
    expect(reference?.kind === 'Slot' ? reference.linkage : null).toBe('Game.LegacyChild');
    expect(getNodeWorldMatrix(reference!.target)).toMatchObject({ a: 2, d: 3, tx: 5, ty: -2 });
  });

  it('applies legacy RemoveObject before freezing the first frame', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_DEFINE_SPRITE,
          joinBytes(
            uint16(20),
            uint16(1),
            createTag(
              TAG_PLACE_OBJECT_2,
              joinBytes(
                new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
                uint16(1),
                uint16(7),
                swfString('removedChild'),
              ),
            ),
            createTag(TAG_SHOW_FRAME),
            createTag(TAG_END),
          ),
        ),
        createTag(TAG_PLACE_OBJECT, joinBytes(uint16(20), uint16(4), createMatrix(1, 0, 0, 1, 0, 0))),
        createTag(TAG_REMOVE_OBJECT, joinBytes(uint16(20), uint16(4))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document?.references).toEqual([]);
  });

  it('applies RemoveObject2 before freezing the first frame', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
            uint16(4),
            uint16(7),
            swfString('removedSlot'),
          ),
        ),
        createTag(TAG_REMOVE_OBJECT_2, uint16(4)),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document?.references).toEqual([]);
  });

  it('imports named slots from nested DefineSprite timelines', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(-20, 180, -40, 160))),
        createTag(
          TAG_DEFINE_SPRITE,
          joinBytes(
            uint16(20),
            uint16(1),
            createTag(
              TAG_PLACE_OBJECT_2,
              joinBytes(
                new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_MATRIX | PLACE_HAS_CHARACTER]),
                uint16(2),
                uint16(7),
                createMatrix(1, 0, 0, 1, 40, 60),
                swfString('avatarSlot'),
              ),
            ),
            createTag(TAG_SHOW_FRAME),
            createTag(TAG_END),
          ),
        ),
        createTag(
          TAG_DEFINE_SPRITE,
          joinBytes(
            uint16(30),
            uint16(1),
            createTag(
              TAG_PLACE_OBJECT_2,
              joinBytes(
                new Uint8Array([PLACE_HAS_MATRIX | PLACE_HAS_CHARACTER]),
                uint16(1),
                uint16(20),
                createMatrix(2, 0, 0, 3, 20, 20),
              ),
            ),
            createTag(TAG_SHOW_FRAME),
            createTag(TAG_END),
          ),
        ),
        createTag(
          TAG_SYMBOL_CLASS,
          joinBytes(uint16(2), uint16(30), swfString('Game.Panel'), uint16(7), swfString('Game.Avatar')),
        ),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_MATRIX | PLACE_HAS_CHARACTER]),
            uint16(1),
            uint16(30),
            createMatrix(2, 0, 0, 3, 100, 40),
            swfString('panelSlot'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document?.references).toHaveLength(2);
    const panel = document!.references[0];
    const avatar = document!.references[1];
    expect(panel.name).toBe('panelSlot');
    expect(panel.kind === 'Slot' ? panel.linkage : null).toBe('Game.Panel');
    expect(avatar.name).toBe('avatarSlot');
    expect(avatar.kind === 'Slot' ? avatar.linkage : null).toBe('Game.Avatar');
    expect(getNodeLocalBoundsRectangle(panel.target)).toMatchObject({ height: 30, width: 20, x: 3, y: 4 });
    expect(getNodeLocalBoundsRectangle(avatar.target)).toMatchObject({ height: 10, width: 10, x: -1, y: -2 });
    const intermediate = getNodeParent(avatar.target);
    expect(intermediate).not.toBeNull();
    expect(getNodeParent(intermediate!)).toBe(panel.target);

    const world = getNodeWorldMatrix(avatar.target);
    expect(world.a).toBeCloseTo(4);
    expect(world.d).toBeCloseTo(9);
    expect(world.tx).toBeCloseTo(15);
    expect(world.ty).toBeCloseTo(32);
  });

  it('preserves authored dimensions from lossless bitmap definitions', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_DEFINE_BITS_LOSSLESS,
          joinBytes(uint16(11), new Uint8Array([LOSSLESS_BITMAP_FORMAT_32_BIT]), uint16(32), uint16(16)),
        ),
        createTag(
          TAG_DEFINE_BITS_LOSSLESS_2,
          joinBytes(
            uint16(12),
            new Uint8Array([LOSSLESS_BITMAP_FORMAT_COLORMAPPED]),
            uint16(8),
            uint16(4),
            new Uint8Array([0]),
          ),
        ),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
            uint16(1),
            uint16(11),
            swfString('rgbBitmap'),
          ),
        ),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
            uint16(2),
            uint16(12),
            swfString('alphaBitmap'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(getNodeLocalBoundsRectangle(document!.references[0].target)).toMatchObject({
      height: 16,
      width: 32,
      x: 0,
      y: 0,
    });
    expect(getNodeLocalBoundsRectangle(document!.references[1].target)).toMatchObject({
      height: 4,
      width: 8,
      x: 0,
      y: 0,
    });
  });

  it('preserves authored dimensions from a video stream definition', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_DEFINE_VIDEO_STREAM,
          joinBytes(uint16(13), uint16(10), uint16(320), uint16(180), new Uint8Array([0, 2])),
        ),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
            uint16(1),
            uint16(13),
            swfString('videoSlot'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(getNodeLocalBoundsRectangle(document!.references[0].target)).toMatchObject({
      height: 180,
      width: 320,
      x: 0,
      y: 0,
    });
  });

  it('preserves PNG and GIF dimensions embedded by DefineBitsJPEG2', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_BITS_JPEG_2, joinBytes(uint16(14), createPngHeader(48, 24))),
        createTag(TAG_DEFINE_BITS_JPEG_2, joinBytes(uint16(15), createGifHeader(17, 9))),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
            uint16(1),
            uint16(14),
            swfString('pngBitmap'),
          ),
        ),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
            uint16(2),
            uint16(15),
            swfString('gifBitmap'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(getNodeLocalBoundsRectangle(document!.references[0].target)).toMatchObject({
      height: 24,
      width: 48,
      x: 0,
      y: 0,
    });
    expect(getNodeLocalBoundsRectangle(document!.references[1].target)).toMatchObject({
      height: 9,
      width: 17,
      x: 0,
      y: 0,
    });
  });

  it('bounds DefineBitsJPEG3 and DefineBitsJPEG4 images before their alpha payloads', () => {
    const jpeg3 = createJpegHeader(64, 32);
    const jpeg4 = createJpegHeader(31, 19);
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_DEFINE_BITS_JPEG_3,
          joinBytes(uint16(16), uint32(jpeg3.length), jpeg3, new Uint8Array([1, 2, 3])),
        ),
        createTag(
          TAG_DEFINE_BITS_JPEG_4,
          joinBytes(uint16(17), uint32(jpeg4.length + 2), uint16(0), jpeg4, new Uint8Array([4, 5, 6])),
        ),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
            uint16(1),
            uint16(16),
            swfString('jpeg3Bitmap'),
          ),
        ),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
            uint16(2),
            uint16(17),
            swfString('jpeg4Bitmap'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(getNodeLocalBoundsRectangle(document!.references[0].target)).toMatchObject({
      height: 32,
      width: 64,
      x: 0,
      y: 0,
    });
    expect(getNodeLocalBoundsRectangle(document!.references[1].target)).toMatchObject({
      height: 19,
      width: 31,
      x: 0,
      y: 0,
    });
  });

  it('rejects compressed and truncated inputs without throwing', () => {
    const compressed = createSwf([createTag(TAG_END)]);
    compressed[0] = 0x43;
    expect(createScene2DFromSwf(compressed)).toBeNull();
    expect(createScene2DFromSwf(new Uint8Array([0x46, 0x57, 0x53]))).toBeNull();
    expect(createScene2DFromSwf(createSwf([]))).toBeNull();
    expect(
      createScene2DFromSwf(
        createSwf([
          createTag(TAG_DEFINE_SPRITE, joinBytes(uint16(1), uint16(1), createTag(TAG_SHOW_FRAME))),
          createTag(TAG_END),
        ]),
      ),
    ).toBeNull();
    expect(
      createScene2DFromSwf(
        createSwf([
          createTag(
            TAG_DEFINE_VIDEO_STREAM,
            joinBytes(uint16(1), uint16(10), uint16(320), uint16(180), new Uint8Array([0])),
          ),
          createTag(TAG_END),
        ]),
      ),
    ).toBeNull();
    expect(
      createScene2DFromSwf(
        createSwf([createTag(TAG_PLACE_OBJECT, joinBytes(uint16(7), uint16(1))), createTag(TAG_END)]),
      ),
    ).toBeNull();
    expect(createScene2DFromSwf(createSwf([createTag(TAG_REMOVE_OBJECT, uint16(7)), createTag(TAG_END)]))).toBeNull();
    expect(
      createScene2DFromSwf(
        createSwf([
          createTag(TAG_PLACE_OBJECT_4, new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER, PLACE_HAS_CLASS_NAME])),
          createTag(TAG_END),
        ]),
      ),
    ).toBeNull();
    expect(
      createScene2DFromSwf(
        createSwf([
          createTag(
            TAG_DEFINE_BITS_LOSSLESS,
            joinBytes(new Uint8Array([1, 0, LOSSLESS_BITMAP_FORMAT_32_BIT]), uint16(32)),
          ),
          createTag(TAG_END),
        ]),
      ),
    ).toBeNull();
    expect(
      createScene2DFromSwf(
        createSwf([
          createTag(
            TAG_DEFINE_BITS_LOSSLESS_2,
            joinBytes(uint16(1), new Uint8Array([LOSSLESS_BITMAP_FORMAT_15_BIT]), uint16(8), uint16(4)),
          ),
          createTag(TAG_END),
        ]),
      ),
    ).toBeNull();
    expect(
      createScene2DFromSwf(
        createSwf([
          createTag(
            TAG_DEFINE_BITS_LOSSLESS,
            joinBytes(uint16(1), new Uint8Array([LOSSLESS_BITMAP_FORMAT_32_BIT]), uint16(8), uint16(4)),
          ),
          createTag(
            TAG_DEFINE_VIDEO_STREAM,
            joinBytes(uint16(1), uint16(10), uint16(320), uint16(180), new Uint8Array([0, 2])),
          ),
          createTag(TAG_END),
        ]),
      ),
    ).toBeNull();
    expect(
      createScene2DFromSwf(
        createSwf([createTag(TAG_DEFINE_BITS_JPEG_2, joinBytes(uint16(1), createPngHeader(0, 8))), createTag(TAG_END)]),
      ),
    ).toBeNull();
    expect(
      createScene2DFromSwf(
        createSwf([
          createTag(
            TAG_DEFINE_BITS_JPEG_3,
            joinBytes(uint16(1), uint32(100), createJpegHeader(8, 8), new Uint8Array([1])),
          ),
          createTag(TAG_END),
        ]),
      ),
    ).toBeNull();
    expect(
      createScene2DFromSwf(
        createSwf([
          createTag(TAG_DEFINE_BITS_JPEG_4, joinBytes(uint16(1), uint32(1), uint16(0), createJpegHeader(8, 8))),
          createTag(TAG_END),
        ]),
      ),
    ).toBeNull();
  });

  it('rejects recursive sprite definitions without overflowing the graph walk', () => {
    expect(
      createScene2DFromSwf(
        createSwf([
          createTag(
            TAG_DEFINE_SPRITE,
            joinBytes(
              uint16(1),
              uint16(1),
              createTag(
                TAG_PLACE_OBJECT_2,
                joinBytes(
                  new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
                  uint16(1),
                  uint16(1),
                  swfString('recursiveChild'),
                ),
              ),
              createTag(TAG_SHOW_FRAME),
              createTag(TAG_END),
            ),
          ),
          createTag(
            TAG_PLACE_OBJECT_2,
            joinBytes(
              new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
              uint16(1),
              uint16(1),
              swfString('recursiveRoot'),
            ),
          ),
          createTag(TAG_SHOW_FRAME),
          createTag(TAG_END),
        ]),
      ),
    ).toBeNull();
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

function createLegacyColorTransform(): Uint8Array {
  const writer = new BitWriter();
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(2, 4);
  for (let i = 0; i < 3; i++) writer.writeSigned(1, 2);
  for (let i = 0; i < 3; i++) writer.writeSigned(-1, 2);
  return writer.toBytes();
}

function createGifHeader(width: number, height: number): Uint8Array {
  return joinBytes(_encoder.encode('GIF89a'), uint16(width), uint16(height));
}

function createJpegHeader(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0,
    17,
    8,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    3,
    1,
    0x11,
    0,
    2,
    0x11,
    0,
    3,
    0x11,
    0,
    0xff,
    0xd9,
  ]);
}

function createPngHeader(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    13,
    0x49,
    0x48,
    0x44,
    0x52,
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
  ]);
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
const LOSSLESS_BITMAP_FORMAT_15_BIT = 4;
const LOSSLESS_BITMAP_FORMAT_32_BIT = 5;
const LOSSLESS_BITMAP_FORMAT_COLORMAPPED = 3;
const PLACE_HAS_CHARACTER = 0x02;
const PLACE_HAS_CLASS_NAME = 0x08;
const PLACE_HAS_MATRIX = 0x04;
const PLACE_HAS_NAME = 0x20;
const PLACE_MOVE = 0x01;
const SWF_PREFIX_LENGTH = 8;
const TAG_END = 0;
const TAG_DEFINE_BITS_JPEG_2 = 21;
const TAG_DEFINE_BITS_JPEG_3 = 35;
const TAG_DEFINE_BITS_JPEG_4 = 90;
const TAG_DEFINE_BITS_LOSSLESS = 20;
const TAG_DEFINE_BITS_LOSSLESS_2 = 36;
const TAG_DEFINE_SHAPE = 2;
const TAG_DEFINE_SPRITE = 39;
const TAG_DEFINE_VIDEO_STREAM = 60;
const TAG_FILE_ATTRIBUTES = 69;
const TAG_PLACE_OBJECT = 4;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_PLACE_OBJECT_3 = 70;
const TAG_PLACE_OBJECT_4 = 94;
const TAG_REMOVE_OBJECT = 5;
const TAG_REMOVE_OBJECT_2 = 28;
const TAG_SHOW_FRAME = 1;
const TAG_SYMBOL_CLASS = 76;
const _encoder = new TextEncoder();
