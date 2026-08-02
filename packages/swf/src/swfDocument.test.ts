import { registerDecompressor, unregisterDecompressor } from '@flighthq/compression/contract';
import {
  getMovieClipCurrentFrame,
  getMovieClipCurrentLabel,
  getMovieClipTotalFrames,
  gotoAndStopMovieClip,
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
import type { MovieClip, Shape } from '@flighthq/types/contract';
import { Compression, MovieClipKind, ShapeKind } from '@flighthq/types/contract';

import { createScene2DFromSwf, registerSwfScene2DDocumentImporter } from './swfDocument';
import { ShapeWriter } from './swfShapeTestHelper';

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

    expect(document?.references).toEqual([]);
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

    const target = document!.references[0].target;
    expect(target.kind).not.toBe(ShapeKind);
    expect(getNodeLocalBoundsRectangle(target)).toMatchObject({ height: 5, width: 10, x: 0, y: 0 });
  });

  it('carries an embedded image out as undecoded asset bytes for the resolve step', () => {
    const png = createPngHeader(24, 12);
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_BITS_JPEG_2, joinBytes(uint16(9), png)),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(9))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const reference = document!.references[0];
    expect(reference.kind).toBe('Asset');
    expect(reference.kind === 'Asset' ? reference.uri : null).toBe('swf:bitmap/9');
    expect(reference.kind === 'Asset' ? reference.mimeType : null).toBe('image/png');
    // The bytes are the payload exactly as the file carried it — nothing is decoded at import.
    expect(reference.kind === 'Asset' ? reference.bytes : null).toEqual(png);
    expect(reference.content).toBeNull();
    expect(getNodeLocalBoundsRectangle(reference.target)).toMatchObject({ height: 12, width: 24 });
  });

  it('resolves an embedded image only when a caller asks for it', () => {
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

    // Importing decodes nothing: until a resolver runs, the reference is unfilled.
    expect(document!.references[0].content).toBeNull();

    const decoded = createDisplayObject();
    const resources = resolveScene2DResources(document!, {
      resolveAssetContent: (reference) => (reference.mimeType === 'image/jpeg' && reference.bytes ? decoded : null),
    });

    expect(resources.resolved).toHaveLength(1);
    expect(resources.unresolved).toEqual([]);
    expect(document!.references[0].content).toBe(decoded);
    expect(document!.references[0].name).toBe('logo');
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

    expect(document?.references.map((reference) => reference.name)).toEqual(['kid']);
    // An empty stream is an empty movie, not a malformed one.
    expect(createScene2DFromSwf(createSwf([]))?.references).toEqual([]);
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
      expect(document?.references.map((reference) => reference.name)).toEqual(['packed']);
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

    expect(document?.references).toHaveLength(1);
    expect(document?.references[0].name).toBe('empty');
    expect(getNodeLocalBoundsRectangle(document!.references[0].target)).toMatchObject({
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

    expect(document?.references.map((reference) => reference.name)).toEqual(['firstFrameSlot', 'secondFrameSlot']);

    const root = document!.root as MovieClip;
    const first = document!.references[0].target;
    const second = document!.references[1].target;
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
    const mover = document!.references[0].target;
    expect(document?.references).toHaveLength(1);
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
    const under = document!.references[0].target;
    const over = document!.references[1].target;
    const between = document!.references[2].target;
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
    expect(document?.references.map((reference) => reference.name)).toEqual(['panel', 'firstChild', 'secondChild']);

    const panel = document!.references[0].target as MovieClip;
    const firstChild = document!.references[1].target;
    const secondChild = document!.references[2].target;
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
const TAG_DEFINE_FONT = 10;
const TAG_DEFINE_SHAPE = 2;
const TAG_DEFINE_SHAPE_3 = 32;
const TAG_DEFINE_SPRITE = 39;
const TAG_DEFINE_TEXT = 11;
const TAG_DEFINE_VIDEO_STREAM = 60;
const TAG_FILE_ATTRIBUTES = 69;
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
