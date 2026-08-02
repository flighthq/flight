import {
  registerDecompressor,
  registerDeflateDecompressor,
  unregisterDecompressor,
} from '@flighthq/compression/contract';
import { createGlyphRasterizerBackendFromGlyphOutlineSource } from '@flighthq/font/contract';
import { createGlyphAtlas, getGlyphAtlasEntry } from '@flighthq/glyphatlas/contract';
import {
  getMovieClipCurrentFrame,
  getMovieClipCurrentLabel,
  getMovieClipFrameScript,
  getMovieClipTotalFrames,
  gotoAndStopMovieClip,
  isMovieClipPlaying,
  playMovieClip,
} from '@flighthq/movieclip/contract';
import {
  getNodeChildren,
  getNodeLocalBoundsRectangle,
  getNodeLocalMatrix,
  getNodeParent,
  getNodeWorldMatrix,
} from '@flighthq/node/contract';
import {
  createScene2DDocumentFromBytes,
  createScene2DDocumentImporterRegistry,
  resolveScene2DResources,
} from '@flighthq/scene2d-resources/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { getTextureSource, getTextureWidth } from '@flighthq/texture/contract';
import type { MorphShape, MovieClip, RichText, Shape, Sprite, Texture2D } from '@flighthq/types/contract';
import {
  Compression,
  ImageResourceReferenceKind,
  MorphShapeKind,
  MovieClipKind,
  ResourceResolutionState,
  RichTextKind,
  ShapeKind,
  SpriteKind,
} from '@flighthq/types/contract';

import {
  createGlyphOutlineSourcesFromSwf,
  createScene2DFromSwf,
  createScene2DSymbolFromSwf,
  readSwfExportedSymbolNames,
  registerSwfScene2DDocumentImporter,
} from './swfDocument';
import { ShapeWriter } from './swfShapeTestHelper';

describe('createGlyphOutlineSourcesFromSwf', () => {
  it('funnels a DefineFont2 outline and code table through the font adapter into glyphatlas', () => {
    const glyph = new ShapeWriter();
    glyph.writeStyleBits(1, 0);
    glyph.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    glyph.writeStraightEdge(256, 0);
    glyph.writeStraightEdge(0, 256);
    glyph.writeStraightEdge(-256, 0);
    glyph.writeStraightEdge(0, -256);
    glyph.writeEndShape();
    const glyphBytes = glyph.toBytes();
    const offsets = joinBytes(uint16(4), uint16(4 + glyphBytes.length));
    const font = joinBytes(
      uint16(4),
      new Uint8Array([0x80, 0, 0]),
      uint16(1),
      offsets,
      glyphBytes,
      new Uint8Array([0x41]),
      uint16(800),
      uint16(200),
      uint16(50),
      uint16(600),
      createRectangle(0, 256, 0, 256),
      uint16(0),
    );

    const sources = createGlyphOutlineSourcesFromSwf(
      createSwf([createTag(TAG_DEFINE_FONT_2, font), createTag(TAG_END)]),
    )!;
    const source = sources.get(4)!;
    const rasterizerBackend = createGlyphRasterizerBackendFromGlyphOutlineSource(source);
    const atlas = createGlyphAtlas({
      fontFamily: 'embedded-swf',
      fontSize: 32,
      height: 64,
      rasterizerBackend,
      width: 64,
    });
    const entry = getGlyphAtlasEntry(atlas, 0x41);

    expect(sources.size).toBe(1);
    expect(source.getGlyphOutlineIndexForCodePoint(0x41)).toBe(0);
    expect(entry).not.toBeNull();
    expect(entry?.advance).toBe(18.75);
    expect(atlas.runtime.bitmaps.get(0x41)?.pixels.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
  });

  it('composes a legacy DefineFont with its separate DefineFontInfo code table', () => {
    const glyph = new ShapeWriter();
    glyph.writeStyleBits(1, 0);
    glyph.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    glyph.writeStraightEdge(256, 0);
    glyph.writeStraightEdge(0, 256);
    glyph.writeStraightEdge(-256, 0);
    glyph.writeStraightEdge(0, -256);
    glyph.writeEndShape();
    const font = joinBytes(uint16(4), uint16(2), glyph.toBytes());
    const fontInfo = joinBytes(uint16(4), new Uint8Array([0, 0, 0x41]));

    const sources = createGlyphOutlineSourcesFromSwf(
      createSwf([createTag(TAG_DEFINE_FONT_INFO, fontInfo), createTag(TAG_DEFINE_FONT, font), createTag(TAG_END)]),
    )!;

    expect(sources.get(4)?.getGlyphOutlineIndexForCodePoint(0x41)).toBe(0);
    expect(sources.get(4)?.getGlyphOutlineIndexForCodePoint(0x42)).toBe(-1);
  });
});

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
    expect(document?.slots).toHaveLength(1);
    expect(getNodeLocalBoundsRectangle(document!.root)).toMatchObject({ height: 50, width: 100, x: 0, y: 0 });
    const reference = document!.slots[0];
    expect(reference.name).toBe('avatarSlot');
    expect(reference.linkage).toBe('Game.Avatar');
    expect(reference.target.name).toBe('avatarSlot');

    const matrix = getNodeLocalMatrix(reference.target);
    expect(matrix.a).toBeCloseTo(1.5);
    expect(matrix.b).toBeCloseTo(0.25);
    expect(matrix.c).toBeCloseTo(-0.125);
    expect(matrix.d).toBeCloseTo(0.5);
    expect(matrix.tx).toBeCloseTo(10);
    expect(matrix.ty).toBeCloseTo(-2);
  });

  it('materializes a placed shape definition as drawable geometry', () => {
    const writer = new ShapeWriter();
    writer.writeSolidFillStyles([0x3366cc]);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(2000, 0);
    writer.writeStraightEdge(0, 1000);
    writer.writeStraightEdge(-2000, 0);
    writer.writeStraightEdge(0, -1000);
    writer.writeEndShape();

    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(0, 2000, 0, 1000), writer.toBytes())),
        // Unnamed: a shape earns a node because it has geometry, not because it is addressable.
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_MATRIX | PLACE_HAS_CHARACTER]),
            uint16(1),
            uint16(7),
            createMatrix(1, 0, 0, 1, 60, 80),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document?.slots).toEqual([]);
    const drawn = getNodeChildren(document!.root)[0] as Shape;
    expect(drawn.kind).toBe(ShapeKind);
    expect(drawn.data.commands.slice(0, 8)).toEqual(['beginFill', 2, 0x3366cc, 1, 'moveTo', 2, 0, 0]);
    expect(getNodeLocalMatrix(drawn)).toMatchObject({ tx: 3, ty: 4 });
    // The authored RECT still sizes the node, not the extent of its own commands.
    expect(getNodeLocalBoundsRectangle(drawn)).toMatchObject({ height: 50, width: 100, x: 0, y: 0 });
  });

  it('gives each placement of one shape definition its own geometry', () => {
    const writer = new ShapeWriter();
    writer.writeSolidFillStyles([0x123456]);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(400, 0);
    writer.writeEndShape();

    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(0, 400, 0, 400), writer.toBytes())),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(7))),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(2), uint16(7))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const children = getNodeChildren(document!.root) as Shape[];
    expect(children).toHaveLength(2);
    expect(children[0]).not.toBe(children[1]);
    expect(children[0].data.commands).not.toBe(children[1].data.commands);
    expect(children[0].data.commands).toEqual(children[1].data.commands);
  });

  it('keeps a shape definition whose body does not parse as a bounded placeholder', () => {
    const document = createScene2DFromSwf(
      createSwf([
        // A bounds prefix with no readable SHAPEWITHSTYLE behind it.
        createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(0, 200, 0, 100))),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(1), uint16(7), swfString('boxed')),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const target = document!.slots[0].target;
    expect(target.kind).not.toBe(ShapeKind);
    expect(getNodeLocalBoundsRectangle(target)).toMatchObject({ height: 5, width: 10, x: 0, y: 0 });
  });

  it('carries an embedded image out as undecoded bytes on a waiting texture', () => {
    const png = createPngHeader(24, 12);
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_BITS_JPEG_2, joinBytes(uint16(9), png)),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(9))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document!.imageResources).toHaveLength(1);
    const reference = document!.imageResources[0];
    expect(reference.kind).toBe(ImageResourceReferenceKind.Embedded);
    expect(reference.mimeType).toBe('image/png');
    // The bytes are the payload exactly as the file carried it — nothing is decoded at import.
    if (reference.kind !== ImageResourceReferenceKind.Embedded) throw new Error('expected an embedded reference');
    expect(reference.bytes).toEqual(png);
    expect(reference.state).toBe(ResourceResolutionState.Unresolved);
    expect(reference.textures).toHaveLength(1);
    expect(getTextureSource(reference.textures![0])).toBeNull();
  });

  it('places a bitmap character as a sprite sized by its authored bounds before any pixels load', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_BITS_JPEG_2, joinBytes(uint16(9), createJpegHeader(8, 8))),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(1), uint16(9), swfString('logo')),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const target = document!.slots[0].target;
    expect(document!.slots[0].name).toBe('logo');
    expect(target.kind).toBe(SpriteKind);
    expect((target as Sprite).data.texture).toBe(document!.imageResources[0].textures![0]);
    expect(getNodeLocalBoundsRectangle(target)).toMatchObject({ height: 8, width: 8 });
  });

  it('shares one image resource across every placement of one bitmap character', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_BITS_JPEG_2, joinBytes(uint16(9), createJpegHeader(8, 8))),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(9))),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(2), uint16(9))),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(3), uint16(9))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    // Three placements, one reference, one texture: the decode is paid for once no matter how often the
    // character is placed.
    expect(document!.imageResources).toHaveLength(1);
    expect(document!.imageResources[0].textures).toHaveLength(1);
  });

  it('accepts a tag stream that reaches its end without an End tag', () => {
    // Flash's own tooling ends a sprite — and sometimes the root — with its last content tag and no
    // terminator. Rejecting those would lose the whole document over a byte no reader needs.
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_DEFINE_SPRITE,
          joinBytes(
            uint16(20),
            uint16(1),
            createTag(
              TAG_PLACE_OBJECT_2,
              joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(1), uint16(7), swfString('kid')),
            ),
            createTag(TAG_SHOW_FRAME),
          ),
        ),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(20))),
        createTag(TAG_SHOW_FRAME),
      ]),
    );

    expect(document?.slots.map((reference) => reference.name)).toEqual(['kid']);
    // An empty stream is an empty movie, not a malformed one.
    expect(createScene2DFromSwf(createSwf([]))?.slots).toEqual([]);
  });

  it('turns a clip-depth placement into a clip on what it covers, and draws no mask', () => {
    const mask = new ShapeWriter();
    mask.writeSolidFillStyles([0xffffff]);
    mask.writeLineStyleCount(0);
    mask.writeStyleBits(1, 0);
    mask.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    mask.writeStraightEdge(800, 0);
    mask.writeStraightEdge(0, 800);
    mask.writeStraightEdge(-800, 0);
    mask.writeStraightEdge(0, -800);
    mask.writeEndShape();

    const content = new ShapeWriter();
    content.writeSolidFillStyles([0xff0000]);
    content.writeLineStyleCount(0);
    content.writeStyleBits(1, 0);
    content.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    content.writeStraightEdge(2000, 0);
    content.writeEndShape();

    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(0, 800, 0, 800), mask.toBytes())),
        createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(8), createRectangle(0, 2000, 0, 100), content.toBytes())),
        // The mask sits at depth 1 and covers through depth 5, offset 100 twips right of the origin.
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_CLIP_DEPTH | PLACE_HAS_MATRIX | PLACE_HAS_CHARACTER]),
            uint16(1),
            uint16(7),
            createMatrix(1, 0, 0, 1, 100, 0),
            uint16(5),
          ),
        ),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_MATRIX | PLACE_HAS_CHARACTER]),
            uint16(3),
            uint16(8),
            createMatrix(1, 0, 0, 1, 40, 0),
          ),
        ),
        // Depth 9 is outside the mask's range, so nothing clips it.
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(9), uint16(8))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    // The mask itself is never drawn: two placements are covered content, the third is the mask.
    const children = getNodeChildren(document!.root);
    expect(children).toHaveLength(2);

    const masked = children[0];
    const unmasked = children[1];
    expect(unmasked.clip).toBeNull();
    expect(masked.clip).not.toBeNull();

    // The mask is a 40x40px square at x=5px; the covered instance sits at x=2px, so in that instance's
    // own local space — where a ClipRegion's contours live — the square starts at x=3px.
    expect(masked.clip?.contours).not.toBeNull();
    expect(masked.clip?.rect).toMatchObject({ height: 40, width: 40, x: 3, y: 0 });
  });

  it('imports a compressed document through a registered decompressor', () => {
    const uncompressed = createSwf([
      createTag(
        TAG_PLACE_OBJECT_2,
        joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(1), uint16(7), swfString('packed')),
      ),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    // A CWS body is a zlib stream, so it resolves the shared Deflate algorithm — the same registration an
    // AWD2 file would use. A CWS file is the same 8-byte header over a compressed body; the declared length already counts
    // uncompressed bytes. This stand-in "compresses" by reversing, so the test exercises the seam and the
    // splice rather than any particular codec.
    const compressed = joinBytes(uncompressed.subarray(0, 8), uncompressed.subarray(8).reverse());
    compressed[0] = 0x43;

    // Without a decompressor the bytes are unreadable, and that reads as the document's null sentinel.
    expect(createScene2DFromSwf(compressed)).toBeNull();

    registerDecompressor(Compression.Deflate, (body, uncompressedLength) => {
      expect(uncompressedLength).toBe(uncompressed.length - 8);
      return new Uint8Array(body).reverse();
    });
    try {
      const document = createScene2DFromSwf(compressed);
      expect(document?.sourceKind).toBe('swf');
      expect(document?.slots.map((reference) => reference.name)).toEqual(['packed']);
    } finally {
      unregisterDecompressor(Compression.Deflate);
    }
  });

  it('rejects a compressed document whose decompressor returns a short or failed body', () => {
    const uncompressed = createSwf([createTag(TAG_SHOW_FRAME), createTag(TAG_END)]);
    const compressed = joinBytes(uncompressed.subarray(0, 8), uncompressed.subarray(8));
    compressed[0] = 0x43;

    registerDecompressor(Compression.Deflate, () => null);
    expect(createScene2DFromSwf(compressed)).toBeNull();

    registerDecompressor(Compression.Deflate, () => new Uint8Array(2));
    expect(createScene2DFromSwf(compressed)).toBeNull();
    unregisterDecompressor(Compression.Deflate);
  });

  it('imports the stage background colour as opaque packed RGBA', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0x33, 0x66, 0x99])),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    // SWF gives the stage colour no alpha and a stage is opaque, so it packs fully opaque.
    expect(document?.backgroundColor).toBe(0x336699ff);
    // A file that declares none reports null rather than a guessed default.
    expect(
      createScene2DFromSwf(createSwf([createTag(TAG_SHOW_FRAME), createTag(TAG_END)]))?.backgroundColor,
    ).toBeNull();
  });

  it('draws static text from an embedded font as placed glyph outlines', () => {
    // One glyph: a 512x512 box on the font's 1024-unit EM grid, as a bare SHAPE with no style array.
    const glyph = new ShapeWriter();
    glyph.writeStyleBits(1, 0);
    glyph.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    glyph.writeStraightEdge(512, 0);
    glyph.writeStraightEdge(0, 512);
    glyph.writeStraightEdge(-512, 0);
    glyph.writeStraightEdge(0, -512);
    glyph.writeEndShape();
    const glyphBytes = glyph.toBytes();

    // DefineFont: id, then an offset table whose first entry is its own byte length.
    const font = joinBytes(uint16(4), uint16(2), glyphBytes);

    // One text record: font 4, height 1024 twips, one glyph at index 0, advancing 600 twips.
    const record = new BitWriter();
    record.writeUnsigned(1, 1); // record type
    record.writeUnsigned(0, 3); // reserved
    record.writeUnsigned(1, 1); // has font
    record.writeUnsigned(1, 1); // has color
    record.writeUnsigned(0, 1); // has y offset
    record.writeUnsigned(0, 1); // has x offset
    const text = joinBytes(
      uint16(6),
      createRectangle(0, 1024, 0, 1024),
      createMatrix(1, 0, 0, 1, 0, 0),
      new Uint8Array([4, 8]), // glyph bits, advance bits
      record.toBytes(),
      uint16(4),
      new Uint8Array([0xff, 0x00, 0x00]),
      uint16(1024),
      new Uint8Array([1]),
      packGlyphEntry(0, 600),
      new Uint8Array([0]),
    );

    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_FONT, font),
        createTag(TAG_DEFINE_TEXT, text),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(6))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const drawn = getNodeChildren(document!.root)[0] as Shape;
    expect(drawn.kind).toBe(ShapeKind);
    // The glyph's own fill is dropped and the record's colour used instead.
    expect(drawn.data.commands[0]).toBe('beginFill');
    expect(drawn.data.commands[2]).toBe(0xff0000);
    // Height 1024 twips over a 1024-unit EM grid is a scale of 1, so the glyph's 512 units land at
    // 512/20 = 25.6px — the same twips-to-pixels conversion every other coordinate gets.
    expect(drawn.data.commands.slice(4, 12)).toEqual(['moveTo', 2, 0, 0, 'lineTo', 2, 25.6, 0]);
  });

  it('imports a button as the display list of its up state', () => {
    const record = (flags: number, characterId: number, depth: number): Uint8Array =>
      joinBytes(
        new Uint8Array([flags]),
        uint16(characterId),
        uint16(depth),
        createMatrix(1, 0, 0, 1, 40, 0),
        createColorTransformWithAlpha(),
      );

    const face = new ShapeWriter();
    face.writeSolidFillStyles([0x445566]);
    face.writeLineStyleCount(0);
    face.writeStyleBits(1, 0);
    face.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    face.writeStraightEdge(400, 0);
    face.writeEndShape();

    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(0, 400, 0, 400), face.toBytes())),
        createTag(
          TAG_DEFINE_BUTTON_2,
          joinBytes(
            uint16(20),
            new Uint8Array([0]),
            uint16(0),
            // Up state, then a down-only state that must not appear in a still document.
            record(0x01, 7, 1),
            record(0x04, 7, 2),
            new Uint8Array([0]),
          ),
        ),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(1), uint16(20), swfString('btn')),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const button = document!.slots[0].target;
    expect(button.kind).toBe(MovieClipKind);
    // One child, not two: the down state is dropped rather than stacked under the up state.
    const children = getNodeChildren(button);
    expect(children).toHaveLength(1);
    expect(getNodeLocalMatrix(children[0])).toMatchObject({ tx: 2, ty: 0 });
  });

  it('splices a legacy DefineBits image with its shared JPEG tables', () => {
    const tables = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x11, 0x22, 0xff, 0xd9]);
    // The image half carries the frame header but no tables, and opens with its own start marker.
    const image = createJpegHeader(16, 8);

    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_JPEG_TABLES, tables),
        createTag(TAG_DEFINE_BITS, joinBytes(uint16(9), image)),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(9))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const reference = document!.imageResources[0];
    expect(reference.mimeType).toBe('image/jpeg');
    // Neither half is a valid JPEG alone: the tables lose their end marker, the image its start marker.
    if (reference.kind !== ImageResourceReferenceKind.Embedded) throw new Error('expected an embedded reference');
    const bytes = reference.bytes;
    expect(bytes.subarray(0, 2)).toEqual(new Uint8Array([0xff, 0xd8]));
    expect(bytes.length).toBe(tables.length - 2 + image.length - 2);
  });

  it('binds a recognized DoAction to the frame that carries it', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_SHOW_FRAME),
        // Frame 2 carries a bare stop, the overwhelmingly common timeline script.
        createTag(TAG_DO_ACTION, new Uint8Array([0x07, 0x00])),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const root = document!.root as MovieClip;
    expect(getMovieClipTotalFrames(root)).toBe(2);
    expect(getMovieClipFrameScript(root, 2)).not.toBeNull();
    expect(getMovieClipFrameScript(root, 1)).toBeNull();

    playMovieClip(root);
    expect(isMovieClipPlaying(root)).toBe(true);
    // Reaching frame 2 runs its script, which stops the clip — the behaviour the file described, applied
    // through Flight's own API rather than by executing anything the file carried.
    gotoAndStopMovieClip(root, 2);
    expect(isMovieClipPlaying(root)).toBe(false);
  });

  it('leaves a frame whose actions are not purely playback commands unbound', () => {
    const document = createScene2DFromSwf(
      createSwf([
        // A push then a stop: partially legible, and therefore declined whole.
        createTag(TAG_DO_ACTION, new Uint8Array([0x96, 0x02, 0x00, 0x08, 0x00, 0x07, 0x00])),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(getMovieClipFrameScript(document!.root as MovieClip, 1)).toBeNull();
  });

  it('imports an edit text field as a text node rather than flattening it to paths', () => {
    const field = joinBytes(
      uint16(12),
      createRectangle(0, 4000, 0, 800),
      // HasText | WordWrap | Multiline | HasTextColor | HasFont, then HasLayout | Border.
      new Uint8Array([0x80 | 0x40 | 0x20 | 0x04 | 0x01, 0x20 | 0x08]),
      uint16(7),
      uint16(240),
      new Uint8Array([0x11, 0x22, 0x33, 0xff]),
      new Uint8Array([2]),
      uint16(20),
      uint16(40),
      uint16(60),
      uint16(80),
      swfString('varName'),
      swfString('Hello'),
    );

    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_EDIT_TEXT, field),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(1), uint16(12), swfString('score')),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const node = document!.slots[0].target as RichText;
    expect(node.kind).toBe(RichTextKind);
    // The authored string survives as text the caller can read and reassign — the property that would be
    // destroyed by flattening the field into glyph outlines.
    expect(node.data.text).toBe('Hello');
    expect(node.data.multiline).toBe(true);
    expect(node.data.wordWrap).toBe(true);
    expect(node.data.border).toBe(true);
    expect(node.data.textColor).toBe(0x112233);
    expect(node.data.width).toBe(200);
    expect(node.data.height).toBe(40);
    // Twips convert throughout: a 240-twip font height is 12px, and the 20/40/60/80-twip layout values
    // become 1/2/3/4 pixels in order.
    expect(node.data.defaultTextFormat).toMatchObject({
      align: 'center',
      indent: 3,
      leading: 4,
      leftMargin: 1,
      rightMargin: 2,
      size: 12,
    });
    // The authored RECT still sizes the node, before any layout has run.
    expect(getNodeLocalBoundsRectangle(node)).toMatchObject({ height: 40, width: 200 });
  });

  it('keeps an unreadable image definition from failing the whole document', () => {
    // A picture this decoder cannot read costs that picture, not the import — the same rule an unreadable
    // shape body, font glyph, or legacy image pair already follows.
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_BITS_JPEG_2, joinBytes(uint16(1), new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(1))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document).not.toBeNull();
    expect(document?.slots).toEqual([]);
  });

  it('never throws on a mutated file, whatever the mutation reaches', () => {
    // The package's whole error contract is a null sentinel, so the property that matters is that no
    // input produces an exception. Mutations are seeded rather than random so a failure is reproducible,
    // and the corpus sweep runs the same property over real files.
    const valid = createSwf([
      createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(0, 2000, 0, 1000))),
      createTag(TAG_DEFINE_SPRITE, joinBytes(uint16(20), uint16(1), createTag(TAG_SHOW_FRAME), createTag(TAG_END))),
      createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([1, 2, 3])),
      createTag(TAG_SYMBOL_CLASS, joinBytes(uint16(1), uint16(20), swfString('Game.Clip'))),
      createTag(
        TAG_PLACE_OBJECT_2,
        joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(1), uint16(20), swfString('slot')),
      ),
      createTag(TAG_DO_ACTION, new Uint8Array([0x07, 0x00])),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);

    let seed = 0x1234abcd;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };

    let imported = 0;
    for (let i = 0; i < 600; i++) {
      const mutant = new Uint8Array(valid);
      if (i % 3 === 0) {
        for (let f = 0; f < 4; f++) mutant[next() % mutant.length] = next() & 0xff;
      } else if (i % 3 === 1) {
        for (let f = 0; f < 3; f++) mutant[8 + (next() % (mutant.length - 8))] = next() & 0xff;
      }
      const cut = i % 3 === 2 ? next() % mutant.length : mutant.length;
      const bytes = mutant.subarray(0, cut);
      expect(() => createScene2DFromSwf(bytes)).not.toThrow();
      if (createScene2DFromSwf(bytes) !== null) imported++;
    }
    // Some mutants must still import, or the property would be passing only because everything is
    // rejected before any real parsing happens.
    expect(imported).toBeGreaterThan(0);
  });

  it('instantiates a symbol that was exported but never placed', () => {
    const face = new ShapeWriter();
    face.writeSolidFillStyles([0x203040]);
    face.writeLineStyleCount(0);
    face.writeStyleBits(1, 0);
    face.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    face.writeStraightEdge(600, 0);
    face.writeEndShape();

    // A library symbol the authoring tool published for code to create, with nothing on the timeline.
    const file = createSwf([
      createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(0, 600, 0, 600), face.toBytes())),
      createTag(
        TAG_DEFINE_SPRITE,
        joinBytes(
          uint16(20),
          uint16(1),
          createTag(
            TAG_PLACE_OBJECT_2,
            joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(1), uint16(7), swfString('art')),
          ),
          createTag(TAG_SHOW_FRAME),
          createTag(TAG_END),
        ),
      ),
      createTag(TAG_EXPORT_ASSETS, joinBytes(uint16(1), uint16(20), swfString('Layout'))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);

    // The document itself is empty, because nothing was placed — which is exactly what a consumer sees.
    expect(getNodeChildren(createScene2DFromSwf(file)!.root)).toEqual([]);
    _exportedSymbolFile = file;
  });

  it('keeps the geometry of a bitmap-filled shape, with its pixels still to come', () => {
    const art = new ShapeWriter();
    art.writeFillStyleCount(1);
    art.writeByte(0x41);
    art.writeUint16(9);
    art.writeIdentityMatrix(0, 0);
    art.writeLineStyleCount(0);
    art.writeStyleBits(1, 0);
    art.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    art.writeStraightEdge(800, 0);
    art.writeStraightEdge(0, 800);
    art.writeEndShape();

    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(0, 800, 0, 800), art.toBytes())),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(7))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    // Artwork built entirely from bitmap-filled shapes used to import as an empty document.
    const drawn = getNodeChildren(document!.root)[0] as Shape;
    expect(drawn.kind).toBe(ShapeKind);
    expect(drawn.data.commands[0]).toBe('beginTextureFill');
    expect(drawn.data.commands.filter((token) => token === 'lineTo').length).toBeGreaterThan(0);
  });

  it('resolves a lossless bitmap fill to pixels at import, with no image resource left to load', () => {
    registerDeflateDecompressor();
    const art = new ShapeWriter();
    art.writeFillStyleCount(1);
    art.writeBitmapFillStyle(0x41, 9, 20);
    art.writeLineStyleCount(0);
    art.writeStyleBits(1, 0);
    art.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    art.writeStraightEdge(800, 0);
    art.writeStraightEdge(0, 800);
    art.writeEndShape();
    // One opaque 24-bit pixel, stored as pad/red/green/blue behind a zlib stored block.
    const pixels = losslessPayload(5, 1, 1, storedDeflate([0, 0x11, 0x22, 0x33]));

    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_BITS_LOSSLESS, joinBytes(uint16(9), pixels)),
        createTag(TAG_DEFINE_SHAPE_3, joinBytes(uint16(7), createRectangle(0, 800, 0, 800), art.toBytes())),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(7))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );
    unregisterDecompressor(Compression.Deflate);

    const drawn = getNodeChildren(document!.root)[0] as Shape;
    expect(drawn.data.commands[0]).toBe('beginTextureFill');
    // A lossless payload is not an image file, so it resolves here rather than through @flighthq/image —
    // which is why it leaves nothing on the document's image-resource contract.
    const texture = drawn.data.commands[2] as Texture2D;
    expect(getTextureSource(texture)).not.toBeNull();
    expect(getTextureWidth(texture)).toBe(1);
    expect(document!.imageResources).toEqual([]);
  });

  it('leaves a lossless bitmap sourceless when no decompressor is registered', () => {
    const art = new ShapeWriter();
    art.writeFillStyleCount(1);
    art.writeBitmapFillStyle(0x41, 9, 20);
    art.writeLineStyleCount(0);
    art.writeStyleBits(1, 0);
    art.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    art.writeStraightEdge(800, 0);
    art.writeEndShape();
    const pixels = losslessPayload(5, 1, 1, storedDeflate([0, 0x11, 0x22, 0x33]));

    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_BITS_LOSSLESS, joinBytes(uint16(9), pixels)),
        createTag(TAG_DEFINE_SHAPE_3, joinBytes(uint16(7), createRectangle(0, 800, 0, 800), art.toBytes())),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(7))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    // The geometry still imports; only the paint is missing, which is the same shape as a caller who
    // never loads an encoded image.
    const drawn = getNodeChildren(document!.root)[0] as Shape;
    expect(drawn.data.commands[0]).toBe('beginTextureFill');
    expect(getTextureSource(drawn.data.commands[2] as Texture2D)).toBeNull();
  });

  it('samples one bitmap character through a texture per sampling variant', () => {
    const art = new ShapeWriter();
    art.writeFillStyleCount(2);
    // The same character, tiled-and-smoothed in one style and clamped-and-sharp in the other.
    art.writeBitmapFillStyle(0x40, 9, 20);
    art.writeBitmapFillStyle(0x43, 9, 20);
    art.writeLineStyleCount(0);
    art.writeStyleBits(2, 0);
    art.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    art.writeStraightEdge(800, 0);
    art.writeStraightEdge(0, 800);
    art.writeEndShape();

    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_BITS_JPEG_2, joinBytes(uint16(9), createJpegHeader(8, 8))),
        createTag(TAG_DEFINE_SHAPE_3, joinBytes(uint16(7), createRectangle(0, 800, 0, 800), art.toBytes())),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(7))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    // Pixels are shared and sampling is not: two textures, one reference, one decode.
    expect(document!.imageResources).toHaveLength(1);
    const textures = document!.imageResources[0].textures!;
    expect(textures).toHaveLength(2);
    expect(textures[0].sampler.wrapU).toBe('repeat');
    expect(textures[0].sampler.magFilter).toBe('linear');
    expect(textures[1].sampler.wrapU).toBe('clamp-to-edge');
    expect(textures[1].sampler.magFilter).toBe('nearest');
  });

  it('reads a JPEG carrying the legacy end-of-image marker between its tables and its pixels', () => {
    // Encoders of the era wrote the encoding tables and the image as two concatenated JPEG streams, so a
    // payload commonly contains an end-of-image immediately followed by a second start-of-image before the
    // frame header ever appears.
    const image = createJpegHeader(32, 16);
    const legacy = joinBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x11, 0x22, 0xff, 0xd9]), image);

    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_BITS_JPEG_2, joinBytes(uint16(9), legacy)),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(9))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    // The placement is unnamed, so it earns no slot: the image travels as a resource and the node it
    // sizes is reached through the graph.
    const reference = document!.imageResources[0];
    expect(reference.mimeType).toBe('image/jpeg');
    const placed = getNodeChildren(document!.root)[0];
    expect(getNodeLocalBoundsRectangle(placed)).toMatchObject({ height: 16, width: 32 });
  });

  it('imports a named empty shape with zero-bit RECT bounds', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SHAPE_3, joinBytes(uint16(1), new Uint8Array([0]))),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(1), uint16(1), swfString('empty')),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document?.slots).toHaveLength(1);
    expect(document?.slots[0].name).toBe('empty');
    expect(getNodeLocalBoundsRectangle(document!.slots[0].target)).toMatchObject({
      height: 0,
      width: 0,
      x: 0,
      y: 0,
    });
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

    expect(document?.slots[0].linkage).toBe('Game.ExternalAvatar');
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

    const reference = document?.slots[0];
    expect(reference?.name).toBe('avatarSlot');
    expect(reference?.linkage).toBe('Game.Avatar');
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

    expect(document?.slots).toEqual([]);
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

    expect(document?.slots).toEqual([]);
  });

  it('enumerates named instances from every frame while attaching only the current one', () => {
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

    expect(document?.slots.map((reference) => reference.name)).toEqual(['firstFrameSlot', 'secondFrameSlot']);

    const root = document!.root as MovieClip;
    const first = document!.slots[0].target;
    const second = document!.slots[1].target;
    expect(getMovieClipTotalFrames(root)).toBe(2);
    expect(getNodeParent(first)).toBe(root);
    expect(getNodeParent(second)).toBeNull();

    gotoAndStopMovieClip(root, 2);
    expect(getNodeParent(first)).toBeNull();
    expect(getNodeParent(second)).toBe(root);

    // Seeking back restores the same nodes rather than replacing them, so a slot bound before playback
    // keeps its target across loops.
    gotoAndStopMovieClip(root, 1);
    expect(getNodeChildren(root)).toEqual([first]);
  });

  it('replays a later frame move onto the instance the move targets', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_MATRIX | PLACE_HAS_CHARACTER]),
            uint16(3),
            uint16(7),
            createMatrix(1, 0, 0, 1, 20, 40),
            swfString('mover'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_MOVE | PLACE_HAS_MATRIX]), uint16(3), createMatrix(2, 0, 0, 2, 200, -60)),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const root = document!.root as MovieClip;
    const mover = document!.slots[0].target;
    expect(document?.slots).toHaveLength(1);
    expect(getNodeLocalMatrix(mover)).toMatchObject({ a: 1, d: 1, tx: 1, ty: 2 });

    gotoAndStopMovieClip(root, 2);
    expect(getMovieClipCurrentFrame(root)).toBe(2);
    expect(getNodeChildren(root)).toEqual([mover]);
    expect(getNodeLocalMatrix(mover)).toMatchObject({ a: 2, d: 2, tx: 10, ty: -3 });
  });

  it('keeps instances in depth order when a later frame places one between them', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(1), uint16(7), swfString('under')),
        ),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(9), uint16(8), swfString('over')),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(5), uint16(9), swfString('between')),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const root = document!.root as MovieClip;
    const under = document!.slots[0].target;
    const over = document!.slots[1].target;
    const between = document!.slots[2].target;
    expect(getNodeChildren(root)).toEqual([under, over]);

    gotoAndStopMovieClip(root, 2);
    expect(getNodeChildren(root)).toEqual([under, between, over]);
  });

  it('imports frame labels and the header frame rate as timeline playback data', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_FRAME_LABEL, swfString('intro')),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(1), uint16(7), swfString('slot')),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_FRAME_LABEL, swfString('outro')),
        createTag(TAG_SHOW_FRAME),
        // A label after the last ShowFrame names a frame the timeline never reaches.
        createTag(TAG_FRAME_LABEL, swfString('unreached')),
        createTag(TAG_END),
      ]),
    );

    const root = document!.root as MovieClip;
    expect(root.kind).toBe(MovieClipKind);
    expect(getMovieClipTotalFrames(root)).toBe(2);
    expect(root.data.timeline?.source?.frameRate).toBe(24);
    expect(root.data.timeline?.source?.labels).toEqual([
      { frame: 1, name: 'intro' },
      { frame: 2, name: 'outro' },
    ]);

    gotoAndStopMovieClip(root, 'outro');
    expect(getMovieClipCurrentFrame(root)).toBe(2);
    expect(getMovieClipCurrentLabel(root)).toMatchObject({ frame: 2, name: 'outro' });
  });

  it('imports root frame labels declared by DefineSceneAndFrameLabelData', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA,
          joinBytes(
            encodedUint32(1),
            encodedUint32(200),
            swfString('Scene 1'),
            encodedUint32(2),
            encodedUint32(0),
            swfString('start'),
            encodedUint32(1),
            swfString('finish'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const root = document!.root as MovieClip;
    expect(root.data.timeline?.source?.labels).toEqual([
      { frame: 1, name: 'start' },
      { frame: 2, name: 'finish' },
    ]);
  });

  it('plays a nested sprite timeline on its own playhead', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_DEFINE_SPRITE,
          joinBytes(
            uint16(20),
            uint16(2),
            createTag(
              TAG_PLACE_OBJECT_2,
              joinBytes(
                new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]),
                uint16(1),
                uint16(7),
                swfString('firstChild'),
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
                swfString('secondChild'),
              ),
            ),
            createTag(TAG_SHOW_FRAME),
            createTag(TAG_END),
          ),
        ),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(1), uint16(20), swfString('panel')),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const root = document!.root as MovieClip;
    expect(document?.slots.map((reference) => reference.name)).toEqual(['panel', 'firstChild', 'secondChild']);

    const panel = document!.slots[0].target as MovieClip;
    const firstChild = document!.slots[1].target;
    const secondChild = document!.slots[2].target;
    expect(getMovieClipTotalFrames(root)).toBe(1);
    expect(getMovieClipTotalFrames(panel)).toBe(2);
    expect(getNodeChildren(panel)).toEqual([firstChild]);

    gotoAndStopMovieClip(panel, 2);
    expect(getNodeChildren(panel)).toEqual([secondChild]);
    expect(getNodeParent(panel)).toBe(root);
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

    const reference = document?.slots[0];
    expect(reference?.name).toBe('metadataSlot');
    expect(reference?.linkage).toBe('Game.MetadataAvatar');
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

    const reference = document?.slots[0];
    expect(reference?.name).toBe('legacyChild');
    expect(reference?.linkage).toBe('Game.LegacyChild');
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

    expect(document?.slots).toEqual([]);
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

    expect(document?.slots).toEqual([]);
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

    expect(document?.slots).toHaveLength(2);
    const panel = document!.slots[0];
    const avatar = document!.slots[1];
    expect(panel.name).toBe('panelSlot');
    expect(panel.linkage).toBe('Game.Panel');
    expect(avatar.name).toBe('avatarSlot');
    expect(avatar.linkage).toBe('Game.Avatar');
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

    expect(getNodeLocalBoundsRectangle(document!.slots[0].target)).toMatchObject({
      height: 16,
      width: 32,
      x: 0,
      y: 0,
    });
    expect(getNodeLocalBoundsRectangle(document!.slots[1].target)).toMatchObject({
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

    expect(getNodeLocalBoundsRectangle(document!.slots[0].target)).toMatchObject({
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

    expect(getNodeLocalBoundsRectangle(document!.slots[0].target)).toMatchObject({
      height: 24,
      width: 48,
      x: 0,
      y: 0,
    });
    expect(getNodeLocalBoundsRectangle(document!.slots[1].target)).toMatchObject({
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

    expect(getNodeLocalBoundsRectangle(document!.slots[0].target)).toMatchObject({
      height: 32,
      width: 64,
      x: 0,
      y: 0,
    });
    expect(getNodeLocalBoundsRectangle(document!.slots[1].target)).toMatchObject({
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

  it('rejects a timeline that multiplies a small display list past the frame budget', () => {
    const tags: Uint8Array[] = [];
    for (let depth = 1; depth <= 200; depth++) {
      tags.push(
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(depth), uint16(7))),
      );
    }
    // Placing 200 depths costs a few kilobytes; showing them 5001 times would retain over a million
    // display-list entries, so the snapshot budget rejects the document instead of materializing it.
    for (let frame = 0; frame < 5001; frame++) tags.push(createTag(TAG_SHOW_FRAME));
    tags.push(createTag(TAG_END));

    expect(createScene2DFromSwf(createSwf(tags))).toBeNull();
  });
});

describe('createScene2DFromSwf morph shapes', () => {
  it('places a morph character and drives its progress from the placement ratio', () => {
    const startEdges = morphBox(200);
    const endEdges = morphBox(400);
    const styles = joinBytes(
      new Uint8Array([1, 0x00, 0xff, 0x00, 0x00, 0xff, 0x00, 0x00, 0xff, 0xff]),
      new Uint8Array([0]),
    );
    const body = joinBytes(
      uint16(7),
      createRectangle(0, 200, 0, 200),
      createRectangle(0, 400, 0, 400),
      uint32(styles.length + startEdges.length),
      styles,
      startEdges,
      endEdges,
    );

    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_MORPH_SHAPE, body),
        // Two placements of one character at different ratios: the case a single shared node cannot serve.
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_HAS_CHARACTER | PLACE_HAS_RATIO]), uint16(1), uint16(7), uint16(0)),
        ),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_HAS_CHARACTER | PLACE_HAS_RATIO]), uint16(2), uint16(7), uint16(0xffff)),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const [first, second] = getNodeChildren(document!.root) as MorphShape[];
    expect(first.kind).toBe(MorphShapeKind);
    expect(second.kind).toBe(MorphShapeKind);
    // Distinct nodes, each sitting at its own point along the same definition.
    expect(first).not.toBe(second);
    expect(first.data.progress).toBe(0);
    expect(second.data.progress).toBe(1);
    expect(morphWidth(first)).toBeCloseTo(10);
    expect(morphWidth(second)).toBeCloseTo(20);
  });
});

describe('createScene2DSymbolFromSwf', () => {
  it('builds a fresh instance of a symbol the file exported but never placed', () => {
    const symbol = createScene2DSymbolFromSwf(_exportedSymbolFile, 'Layout');

    expect(symbol).not.toBeNull();
    expect(symbol!.root.kind).toBe(MovieClipKind);
    expect(getNodeChildren(symbol!.root)).toHaveLength(1);
    // Each call builds its own: a library symbol is a template, not a shared node.
    expect(createScene2DSymbolFromSwf(_exportedSymbolFile, 'Layout')!.root).not.toBe(symbol!.root);
  });

  it('carries the named slots inside the symbol, so a caller can fill them', () => {
    const symbol = createScene2DSymbolFromSwf(_exportedSymbolFile, 'Layout')!;

    expect(symbol.slots.map((slot) => slot.name)).toEqual(['art']);
    expect(symbol.slots[0].target).toBe(getNodeChildren(symbol.root)[0]);
  });

  it('resolves the pixels of a bitmap the symbol draws, the way a placed one does', () => {
    registerDeflateDecompressor();
    const art = new ShapeWriter();
    art.writeFillStyleCount(1);
    art.writeBitmapFillStyle(0x41, 9, 20);
    art.writeLineStyleCount(0);
    art.writeStyleBits(1, 0);
    art.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    art.writeStraightEdge(800, 0);
    art.writeStraightEdge(0, 800);
    art.writeEndShape();
    const pixels = losslessPayload(5, 1, 1, storedDeflate([0, 0x11, 0x22, 0x33]));

    // The bitmap-filled shape is exported by name and never placed, so nothing but the symbol entry
    // reaches it — which is exactly the case that used to hand back artwork with no pixels behind it.
    const symbol = createScene2DSymbolFromSwf(
      createSwf([
        createTag(TAG_DEFINE_BITS_LOSSLESS, joinBytes(uint16(9), pixels)),
        createTag(TAG_DEFINE_SHAPE_3, joinBytes(uint16(7), createRectangle(0, 800, 0, 800), art.toBytes())),
        createTag(TAG_EXPORT_ASSETS, joinBytes(uint16(1), uint16(7), swfString('Art'))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
      'Art',
    );
    unregisterDecompressor(Compression.Deflate);

    const drawn = symbol!.root as Shape;
    expect(drawn.data.commands[0]).toBe('beginTextureFill');
    expect(getTextureSource(drawn.data.commands[2] as Texture2D)).not.toBeNull();
  });

  it('hands an encoded bitmap out on the image-resource contract, naming the waiting texture', () => {
    const art = new ShapeWriter();
    art.writeFillStyleCount(1);
    art.writeBitmapFillStyle(0x41, 9, 20);
    art.writeLineStyleCount(0);
    art.writeStyleBits(1, 0);
    art.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    art.writeStraightEdge(800, 0);
    art.writeStraightEdge(0, 800);
    art.writeEndShape();

    const symbol = createScene2DSymbolFromSwf(
      createSwf([
        createTag(TAG_DEFINE_BITS_JPEG_2, joinBytes(uint16(9), createJpegHeader(2, 3))),
        createTag(TAG_DEFINE_SHAPE_3, joinBytes(uint16(7), createRectangle(0, 800, 0, 800), art.toBytes())),
        createTag(TAG_EXPORT_ASSETS, joinBytes(uint16(1), uint16(7), swfString('Art'))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
      'Art',
    );

    // An encoded payload decodes through @flighthq/image later, so the symbol must carry the same
    // reference a whole-file import would — otherwise its Textures could never be paired with pixels.
    expect(symbol!.imageResources).toHaveLength(1);
    expect(symbol!.imageResources[0].mimeType).toBe('image/jpeg');
    expect(symbol!.imageResources[0].textures).toContain((symbol!.root as Shape).data.commands[2] as Texture2D);
  });

  it('instantiates a bitmap character exported by linkage, not only a sprite or a shape', () => {
    const symbol = createScene2DSymbolFromSwf(
      createSwf([
        createTag(TAG_DEFINE_BITS_JPEG_2, joinBytes(uint16(9), createJpegHeader(2, 3))),
        createTag(TAG_EXPORT_ASSETS, joinBytes(uint16(1), uint16(9), swfString('Pixels'))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
      'Pixels',
    );

    expect(symbol!.root.kind).toBe(SpriteKind);
    expect(symbol!.imageResources).toHaveLength(1);
  });

  it('reports nothing for a name the file does not export', () => {
    expect(createScene2DSymbolFromSwf(_exportedSymbolFile, 'Missing')).toBeNull();
  });
});

describe('readSwfExportedSymbolNames', () => {
  it('lists every exported linkage name, placed or not', () => {
    expect(readSwfExportedSymbolNames(_exportedSymbolFile)).toEqual(['Layout']);
  });

  it('reports an empty list rather than throwing for unreadable bytes', () => {
    expect(readSwfExportedSymbolNames(new Uint8Array([1, 2, 3]))).toEqual([]);
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

// The exported-symbol file the tests above build, shared with the symbol-instantiation suites.
let _exportedSymbolFile: Uint8Array = new Uint8Array();

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

// A CXFORMWITHALPHA with neither multiply nor add terms — the shortest legal form.
function createColorTransformWithAlpha(): Uint8Array {
  const writer = new BitWriter();
  writer.writeUnsigned(0, 1);
  writer.writeUnsigned(0, 1);
  writer.writeUnsigned(0, 4);
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

// One GLYPHENTRY: a 4-bit glyph index followed by an 8-bit signed advance, bit-packed then byte-aligned.
function packGlyphEntry(index: number, advance: number): Uint8Array {
  const writer = new BitWriter();
  writer.writeUnsigned(index, 4);
  writer.writeSigned(advance, 8);
  return writer.toBytes();
}

function encodedUint32(value: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = value;
  do {
    const byte = remaining % 0x80;
    remaining = Math.floor(remaining / 0x80);
    bytes.push(remaining > 0 ? byte | 0x80 : byte);
  } while (remaining > 0);
  return new Uint8Array(bytes);
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
const PLACE_HAS_CLIP_DEPTH = 0x40;
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
const TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA = 86;
const TAG_DEFINE_BITS = 6;
const TAG_DEFINE_BUTTON_2 = 34;
const TAG_DEFINE_EDIT_TEXT = 37;
const TAG_DEFINE_FONT = 10;
const TAG_DEFINE_FONT_2 = 48;
const TAG_DEFINE_FONT_INFO = 13;
const TAG_DEFINE_SHAPE = 2;
const TAG_DEFINE_SHAPE_3 = 32;
const TAG_DEFINE_SPRITE = 39;
const TAG_DEFINE_TEXT = 11;
const TAG_DEFINE_VIDEO_STREAM = 60;
const TAG_DO_ACTION = 12;
const TAG_EXPORT_ASSETS = 56;
const TAG_FILE_ATTRIBUTES = 69;
const TAG_JPEG_TABLES = 8;
const TAG_FRAME_LABEL = 43;
const TAG_PLACE_OBJECT = 4;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_PLACE_OBJECT_3 = 70;
const TAG_PLACE_OBJECT_4 = 94;
const TAG_REMOVE_OBJECT = 5;
const TAG_REMOVE_OBJECT_2 = 28;
const TAG_SET_BACKGROUND_COLOR = 9;
const TAG_SHOW_FRAME = 1;
const TAG_SYMBOL_CLASS = 76;
const _encoder = new TextEncoder();

function losslessPayload(format: number, width: number, height: number, pixels: readonly number[]): Uint8Array {
  return new Uint8Array([format, width & 0xff, width >> 8, height & 0xff, height >> 8, ...pixels]);
}

// A stored (uncompressed) DEFLATE block wrapped in a zlib header, so the test exercises the real
// decompressor rather than a stub.
function storedDeflate(bytes: readonly number[]): number[] {
  const length = bytes.length;
  return [0x78, 0x01, 0x01, length & 0xff, length >> 8, ~length & 0xff, (~length >> 8) & 0xff, ...bytes, 0, 0, 0, 0];
}

// One closed box `width` twips across under fill style 1, as a morph endpoint's bare SHAPE.
function morphBox(width: number): Uint8Array {
  const writer = new ShapeWriter();
  writer.writeStyleBits(2, 2);
  writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 }, 2);
  writer.writeStraightEdge(width, 0);
  writer.writeStraightEdge(0, width);
  writer.writeStraightEdge(-width, 0);
  writer.writeStraightEdge(0, -width);
  writer.writeEndShape();
  return writer.toBytes();
}

function morphWidth(shape: MorphShape): number {
  const data = shape.data.pathBindings[0].path.data;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i += 2) {
    min = Math.min(min, data[i]);
    max = Math.max(max, data[i]);
  }
  return max - min;
}

const PLACE_HAS_RATIO = 0x10;
const TAG_DEFINE_MORPH_SHAPE = 46;
