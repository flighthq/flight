import {
  registerDecompressor,
  registerDeflateDecompressor,
  unregisterDecompressor,
} from '@flighthq/compression/contract';
import { createGlyphRasterizerBackendFromGlyphOutlineSource } from '@flighthq/font/contract';
import { createGlyphAtlas, getGlyphAtlasEntry } from '@flighthq/glyphatlas/contract';
import { clearImageDecoders } from '@flighthq/image-codec/contract';
import { collectImportDiagnostics } from '@flighthq/importdiagnostics/contract';
import {
  getMovieClipCurrentFrame,
  getMovieClipCurrentLabel,
  getMovieClipFrameScript,
  getMovieClipTotalFrames,
  gotoAndStopMovieClip,
  isMovieClipPlaying,
  playMovieClip,
  updateMovieClip,
} from '@flighthq/movieclip/contract';
import {
  getNodeChildren,
  getNodeColorAdjustments,
  getNodeLocalBoundsRectangle,
  getNodeLocalMatrix,
  getNodeParent,
  getNodeWorldMatrix,
} from '@flighthq/node/contract';
import {
  createScene2DDocumentFromBytes,
  createScene2DDocumentImporterRegistry,
  loadScene2DImageResources,
  resolveScene2DResources,
} from '@flighthq/scene2d-resources/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type {
  Bitmap,
  ColorScaleBiasAdjustment,
  EmbeddedAudioResourceReference,
  TimelineAudioCue,
  MorphShape,
  MovieClip,
  Node2D,
  RichText,
  Scale9Shape,
  Shape,
  Sprite,
  Texture2D,
} from '@flighthq/types/contract';
import {
  AdvancedBlendMode,
  BitmapTextureSourceKind,
  BlendMode,
  Compression,
  CompressionFraming,
  DisplayObjectKind,
  ImageResourceReferenceKind,
  ImportDiagnosticSeverity,
  MorphShapeKind,
  MovieClipKind,
  ResourceResolutionState,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
} from '@flighthq/types/contract';

import {
  createGlyphOutlineSourcesFromSwf,
  createScene2DFromSwf,
  createScene2DImportFromSwf,
  createScene2DSymbolFromSwf,
  readSwfExportedSymbolNames,
  registerSwfScene2DDocumentImporter,
} from './swfDocument';
import { buildFrameScriptAbc } from './swfFrameActionTestHelper';
import { registerSwfImageDecoders } from './swfImageDecoder';
import { ShapeWriter } from './swfShapeTestHelper';

beforeEach(() => {
  clearImageDecoders();
  unregisterDecompressor(Compression.Deflate);
});
afterEach(() => {
  clearImageDecoders();
  unregisterDecompressor(Compression.Deflate);
});

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
    expect(target.kind).toBe(DisplayObjectKind);
    expect(getNodeLocalBoundsRectangle(target)).toMatchObject({ height: 5, width: 10, x: 0, y: 0 });
  });

  it('reads a character’s inverted bounds as an empty box rather than discarding the file', () => {
    const writer = new ShapeWriter();
    writer.writeSolidFillStyles([0x123456]);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(400, 0);
    writer.writeEndShape();

    // Real authoring tools emit a degenerate extent for a character that occupies no space. The bounds
    // are advisory, so the odd character costs its own size and nothing else — the shape placed beside
    // it still arrives.
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(400, -400, 300, -300))),
        createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(8), createRectangle(0, 400, 0, 400), writer.toBytes())),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(1), uint16(7), swfString('empty')),
        ),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(2), uint16(8))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document).not.toBeNull();
    expect(getNodeLocalBoundsRectangle(document!.slots[0].target)).toMatchObject({ height: 0, width: 0 });
    const drawn = getNodeChildren(document!.root).filter((child) => child.kind === ShapeKind) as Shape[];
    expect(drawn).toHaveLength(1);
    expect(drawn[0].data.commands.filter((token) => token === 'lineTo')).toHaveLength(1);
  });

  it('collapses a scaling-grid wrapper sprite into one nine-slice shape', () => {
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
        createTag(
          TAG_DEFINE_SPRITE,
          joinBytes(
            uint16(20),
            uint16(1),
            createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(7))),
            createTag(TAG_SHOW_FRAME),
            createTag(TAG_END),
          ),
        ),
        // The grid names the sprite, not the shape — the tag may also precede the sprite it names.
        createTag(TAG_DEFINE_SCALING_GRID, joinBytes(uint16(20), createRectangle(100, 300, 100, 300))),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(20))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const children = getNodeChildren(document!.root);
    expect(children).toHaveLength(1);
    const target = children[0] as Scale9Shape;
    expect(target.kind).toBe(Scale9ShapeKind);
    // Twips convert to pixels, and the shape's own commands come with it rather than staying behind a
    // MovieClip that the nine-slice rewrite could never reach.
    expect(target.data.scale9Grid).toMatchObject({ height: 10, width: 10, x: 5, y: 5 });
    expect(target.data.commands.filter((token) => token === 'lineTo')).toHaveLength(1);
    expect(getNodeChildren(target)).toHaveLength(0);
  });

  it('leaves a scaling grid on a sprite that is more than a wrapper as an ordinary clip', () => {
    const writer = new ShapeWriter();
    writer.writeSolidFillStyles([0x123456]);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(400, 0);
    writer.writeEndShape();

    const document = createScene2DFromSwf(
      createSwf([
        // A real shape body, so the layer count is the only thing that can disqualify the wrapper.
        createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(0, 400, 0, 400), writer.toBytes())),
        createTag(
          TAG_DEFINE_SPRITE,
          joinBytes(
            uint16(20),
            uint16(1),
            // Two layers, so the grid describes a composition no single shape's commands can carry.
            createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(7))),
            createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(2), uint16(7))),
            createTag(TAG_SHOW_FRAME),
            createTag(TAG_END),
          ),
        ),
        createTag(TAG_DEFINE_SCALING_GRID, joinBytes(uint16(20), createRectangle(100, 300, 100, 300))),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(20))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const target = getNodeChildren(document!.root)[0];
    expect(target.kind).toBe(MovieClipKind);
  });

  it('carries an MP3 event sound out as undecoded bytes past its seek prefix', () => {
    // format 2 (MP3) << 4 | 22kHz | 16-bit | stereo, then the sample count, then the SI16 seek offset the
    // bitstream is not part of, then the frames themselves.
    const frames = new Uint8Array([0xff, 0xfb, 0x90, 0x44, 0x11, 0x22]);
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SOUND, joinBytes(uint16(9), new Uint8Array([0x2b]), uint32(1152), uint16(0), frames)),
        // Publishing the sound by name is what makes it reachable when no frame ever cues it.
        createTag(TAG_EXPORT_ASSETS, joinBytes(uint16(1), uint16(9), swfString('theme'))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document!.audioResources).toHaveLength(1);
    const reference = document!.audioResources[0] as EmbeddedAudioResourceReference;
    expect(reference.kind).toBe('Embedded');
    expect(reference.mimeType).toBe('audio/mpeg');
    expect([...reference.bytes]).toEqual([...frames]);
    expect(reference.name).toBe('theme');
    // The resource exists before its samples do, so a cue has something to hold.
    expect(reference.resource.buffer).toBeNull();
    expect(reference.state).toBe(ResourceResolutionState.Unresolved);
  });

  it('tags a sound whose format has no standard container instead of dropping it untyped', () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const document = createScene2DFromSwf(
      createSwf([
        // format 1 (ADPCM): no MIME type Flight can name, and no seek prefix to skip.
        createTag(TAG_DEFINE_SOUND, joinBytes(uint16(9), new Uint8Array([0x1b]), uint32(16), payload)),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document!.audioResources).toHaveLength(1);
    const reference = document!.audioResources[0] as EmbeddedAudioResourceReference;
    // Tagged with a vendor type carrying what the ADPCM bitstream itself does not encode, so a decoder can
    // register against it before one exists. 0x1b is 22.05kHz, 16-bit, stereo.
    expect(reference.mimeType).toBe('audio/vnd.adobe.swf-adpcm; rate=22050; channels=2; bits=16');
    // No ExportAssets for this one, so nothing published a name for it.
    expect(reference.name).toBeNull();
    expect([...reference.bytes]).toEqual([...payload]);
  });

  it('turns a StartSound into an audio cue sharing the document’s resource', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SOUND, joinBytes(uint16(9), new Uint8Array([0x2b]), uint32(1152), uint16(0), mp3())),
        createTag(TAG_SHOW_FRAME),
        // 0x00: plain event sound, no in/out, no loops, no envelope.
        createTag(TAG_START_SOUND, joinBytes(uint16(9), new Uint8Array([0x00]))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const source = (document!.root as MovieClip).data.timeline!.source!;
    expect(source.cues).toHaveLength(1);
    const cue = source.cues[0] as TimelineAudioCue;
    expect(cue.kind).toBe('Audio');
    // The trigger sits on the frame its tag precedes, not the frame that was already shown.
    expect(cue.frame).toBe(2);
    expect(cue.stop).toBe(false);
    expect(cue.loops).toBe(1);
    expect(cue.offset).toBe(0);
    expect(cue.duration).toBeNull();
    expect(cue.envelope).toEqual([]);
    expect(cue.skipIfPlaying).toBe(false);
    // One resource, held by the cue and listed by the document, so one decode serves both.
    expect(cue.resource).toBe(document!.audioResources[0].resource);
  });

  it('gives every cue naming one sound the same resource the document lists', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SOUND, joinBytes(uint16(9), new Uint8Array([0x2b]), uint32(1152), uint16(0), mp3())),
        createTag(TAG_START_SOUND, joinBytes(uint16(9), new Uint8Array([0x00]))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_START_SOUND, joinBytes(uint16(9), new Uint8Array([0x00]))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const cues = (document!.root as MovieClip).data.timeline!.source!.cues as readonly TimelineAudioCue[];
    expect(cues).toHaveLength(2);
    expect(cues[0].frame).toBe(1);
    expect(cues[1].frame).toBe(2);
    // The whole point of holding the entity rather than a name: one decode fills what both cues play, and
    // the document lists that same resource so loading it wires both at once.
    expect(cues[0].resource).toBe(cues[1].resource);
    expect(cues[0].resource).toBe(document!.audioResources[0].resource);
    expect(document!.audioResources).toHaveLength(1);
  });

  it('resolves a StartSound2 class name against the character SymbolClass bound it to', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SOUND, joinBytes(uint16(9), new Uint8Array([0x2b]), uint32(1152), uint16(0), mp3())),
        // The trigger names a class, and SymbolClass — which says what that class is — comes after it, as
        // it does in every real file: it is written near the end, past the sprites that trigger sounds.
        createTag(TAG_START_SOUND_2, joinBytes(swfString('Game.Theme'), new Uint8Array([0x00]))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_SYMBOL_CLASS, joinBytes(uint16(1), uint16(9), swfString('Game.Theme'))),
        createTag(TAG_END),
      ]),
    );

    const cue = (document!.root as MovieClip).data.timeline!.source!.cues[0] as TimelineAudioCue;
    expect(cue.kind).toBe('Audio');
    expect(cue.stop).toBe(false);
    // Resolved back to the character, so it plays the sound the document carries rather than silence.
    expect(cue.resource).toBe(document!.audioResources[0].resource);
    expect(document!.audioResources).toHaveLength(1);
  });

  it('shares one resource between a class-named trigger and an id-named one', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SOUND, joinBytes(uint16(9), new Uint8Array([0x2b]), uint32(1152), uint16(0), mp3())),
        createTag(TAG_START_SOUND_2, joinBytes(swfString('Game.Theme'), new Uint8Array([0x00]))),
        createTag(TAG_START_SOUND, joinBytes(uint16(9), new Uint8Array([0x00]))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_SYMBOL_CLASS, joinBytes(uint16(1), uint16(9), swfString('Game.Theme'))),
        createTag(TAG_END),
      ]),
    );

    const cues = (document!.root as MovieClip).data.timeline!.source!.cues as readonly TimelineAudioCue[];
    expect(cues).toHaveLength(2);
    // Two ways of naming one sound still decode once.
    expect(cues[0].resource).toBe(cues[1].resource);
    expect(cues[0].resource).toBe(document!.audioResources[0].resource);
  });

  it('converts a class-named trigger’s in point once its character resolves', () => {
    const document = createScene2DFromSwf(
      createSwf([
        // 0x2b is 22.05kHz, so 11025 samples is half a second.
        createTag(TAG_DEFINE_SOUND, joinBytes(uint16(9), new Uint8Array([0x2b]), uint32(44100), uint16(0), mp3())),
        createTag(TAG_START_SOUND_2, joinBytes(swfString('Game.Theme'), new Uint8Array([0x01]), uint32(11025))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_SYMBOL_CLASS, joinBytes(uint16(1), uint16(9), swfString('Game.Theme'))),
        createTag(TAG_END),
      ]),
    );

    const cue = (document!.root as MovieClip).data.timeline!.source!.cues[0] as TimelineAudioCue;
    // The rate came from the character the class resolved to, not from a guess.
    expect(cue.offset).toBeCloseTo(0.5);
  });

  it('keeps a class-named trigger whose class nothing declares', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SOUND, joinBytes(uint16(9), new Uint8Array([0x2b]), uint32(1152), uint16(0), mp3())),
        createTag(TAG_START_SOUND_2, joinBytes(swfString('Game.Missing'), new Uint8Array([0x00]))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const cue = (document!.root as MovieClip).data.timeline!.source!.cues[0] as TimelineAudioCue;
    // The trigger is real; the sound it names simply is not in this file, so its resource never fills.
    expect(cue.resource).not.toBe(document!.audioResources[0].resource);
    expect(cue.resource.buffer).toBeNull();
  });

  it('reads a stop trigger as a stop rather than a play', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SOUND, joinBytes(uint16(9), new Uint8Array([0x2b]), uint32(1152), uint16(0), mp3())),
        // 0x20 is SyncStop; 0x10 alongside it is SyncNoMultiple, which a stop has no use for.
        createTag(TAG_START_SOUND, joinBytes(uint16(9), new Uint8Array([0x30]))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const cue = (document!.root as MovieClip).data.timeline!.source!.cues[0] as TimelineAudioCue;
    expect(cue.stop).toBe(true);
    expect(cue.skipIfPlaying).toBe(false);
  });

  it('converts in and out points from the sound’s own samples into seconds', () => {
    const document = createScene2DFromSwf(
      createSwf([
        // 0x2b is 22.05kHz, so 11025 samples is half a second.
        createTag(TAG_DEFINE_SOUND, joinBytes(uint16(9), new Uint8Array([0x2b]), uint32(44100), uint16(0), mp3())),
        // 0x03: has in point and out point.
        createTag(TAG_START_SOUND, joinBytes(uint16(9), new Uint8Array([0x03]), uint32(11025), uint32(33075))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const cue = (document!.root as MovieClip).data.timeline!.source!.cues[0] as TimelineAudioCue;
    expect(cue.offset).toBeCloseTo(0.5);
    // The out point is the last sample to play, so the duration spans from the in point to it.
    expect(cue.duration).toBeCloseTo(1.0);
  });

  it('reads a stereo envelope in 44.1kHz samples whatever the sound’s rate', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_SOUND, joinBytes(uint16(9), new Uint8Array([0x2b]), uint32(1152), uint16(0), mp3())),
        // 0x08: has envelope. Two points, the second panned hard left.
        createTag(
          TAG_START_SOUND,
          joinBytes(
            uint16(9),
            new Uint8Array([0x08]),
            new Uint8Array([2]),
            uint32(0),
            uint16(32768),
            uint16(32768),
            uint32(22050),
            uint16(32768),
            uint16(0),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const cue = (document!.root as MovieClip).data.timeline!.source!.cues[0] as TimelineAudioCue;
    expect(cue.envelope).toHaveLength(2);
    expect(cue.envelope[0]).toEqual({ leftGain: 1, rightGain: 1, time: 0 });
    // 22050 of 44.1kHz samples is half a second even though the sound itself is 22.05kHz.
    expect(cue.envelope[1].time).toBeCloseTo(0.5);
    expect(cue.envelope[1].leftGain).toBe(1);
    expect(cue.envelope[1].rightGain).toBe(0);
  });

  it('lets a trigger name a sound the tag stream has not reached yet', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_START_SOUND, joinBytes(uint16(9), new Uint8Array([0x00]))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_DEFINE_SOUND, joinBytes(uint16(9), new Uint8Array([0x2b]), uint32(1152), uint16(0), mp3())),
        createTag(TAG_END),
      ]),
    );

    const cue = (document!.root as MovieClip).data.timeline!.source!.cues[0] as TimelineAudioCue;
    // The cue was built before the payload existed, and still shares the reference's resource.
    expect(cue.resource).toBe(document!.audioResources[0].resource);
  });

  it('carries no audio references for a file that defines no sounds', () => {
    const document = createScene2DFromSwf(createSwf([createTag(TAG_SHOW_FRAME), createTag(TAG_END)]));
    expect(document!.audioResources).toEqual([]);
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

    // The mask is a 40x40px square at x=5px; the covered instance sits at x=2px, so in that instance's
    // own local space — where a ClipRegion's contours live — the square starts at x=3px.
    expect(masked.clip).toMatchObject({
      contours: [[3, 0, 43, 0, 43, 40, 3, 40, 3, 0]],
      rect: { height: 40, width: 40, x: 3, y: 0 },
      winding: 'nonZero',
    });
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

    registerDecompressor(Compression.Deflate, (body, uncompressedLength, framing) => {
      expect(uncompressedLength).toBe(uncompressed.length - 8);
      expect(framing).toBe(CompressionFraming.Rfc1950);
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
    expect(node.data.textColor).toBe(0x112233ff);
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
    expect(imported).toBe(171);
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
    expect(drawn.data.commands.filter((token) => token === 'lineTo')).toHaveLength(2);
  });

  it('emits a lossless bitmap reference synchronously and resolves it only in the async resource pass', async () => {
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
    const drawn = getNodeChildren(document!.root)[0] as Shape;
    expect(drawn.data.commands[0]).toBe('beginTextureFill');
    const texture = drawn.data.commands[2] as Texture2D;
    const reference = document!.imageResources[0];
    expect(document!.imageResources).toHaveLength(1);
    expect(reference.mimeType).toBe('image/x-swf-lossless');
    expect(reference.kind === ImageResourceReferenceKind.Embedded && reference.alphaType).toBe('opaque');
    expect(reference.textures).toEqual([texture]);
    expect(getTextureSource(texture)).toBeNull();

    // Registration is caller-owned and happens after parsing; neither parsing nor reference creation
    // secretly installs a decoder or starts async work.
    registerDeflateDecompressor();
    registerSwfImageDecoders();
    const resources = await loadScene2DImageResources(document!);

    expect(resources.resolved).toEqual([reference]);
    expectLosslessTexturePixel(texture);
  });

  it('parses lossless bitmap reference data without requiring a registered decompressor', () => {
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
    expect(document!.imageResources).toHaveLength(1);
    expect(document!.imageResources[0].state).toBe(ResourceResolutionState.Unresolved);
  });

  it('carries premultiplied lossless-alpha bytes through the reference into the resolved Bitmap', async () => {
    const art = new ShapeWriter();
    art.writeFillStyleCount(1);
    art.writeBitmapFillStyle(0x41, 9, 20);
    art.writeLineStyleCount(0);
    art.writeStyleBits(1, 0);
    art.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    art.writeStraightEdge(800, 0);
    art.writeStraightEdge(0, 800);
    art.writeEndShape();
    const pixels = losslessPayload(5, 1, 1, storedDeflate([0x80, 0x40, 0x20, 0x10]));
    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_BITS_LOSSLESS_2, joinBytes(uint16(9), pixels)),
        createTag(TAG_DEFINE_SHAPE_3, joinBytes(uint16(7), createRectangle(0, 800, 0, 800), art.toBytes())),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(7))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    )!;
    const reference = document.imageResources[0];
    expect(reference.kind === ImageResourceReferenceKind.Embedded && reference.alphaType).toBe('premultiplied');

    registerDeflateDecompressor();
    registerSwfImageDecoders();
    await loadScene2DImageResources(document);

    const drawn = getNodeChildren(document.root)[0] as Shape;
    const source = getTextureSource(drawn.data.commands[2] as Texture2D);
    expect(source?.kind).toBe(BitmapTextureSourceKind);
    if (source?.kind !== BitmapTextureSourceKind) throw new Error('expected a lossless bitmap source');
    const bitmap = source as Bitmap;
    expect(bitmap.alphaType).toBe('premultiplied');
    expect([...bitmap.data]).toEqual([0x40, 0x20, 0x10, 0x80]);
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

  it('splits a placement colour transform across node alpha and a colour scale/bias adjustment', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_COLOR_TRANSFORM | PLACE_HAS_CHARACTER]),
            uint16(3),
            uint16(7),
            // Half red, double green, unchanged blue, half alpha; +51/255 blue, no alpha add.
            createColorTransform([128, 512, 256, 128], [0, 0, 51, 0]),
            swfString('tinted'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const tinted = document!.slots[0].target;
    const adjustment = getNodeColorAdjustments(tinted)![0] as ColorScaleBiasAdjustment;
    expect(tinted.alpha).toBe(0.5);
    expect(adjustment.kind).toBe('ColorScaleBiasAdjustment');
    expect(adjustment.colorScaleBias).toMatchObject({
      alphaBias: 0,
      alphaScale: 1,
      blueBias: 0.2,
      blueScale: 1,
      greenScale: 2,
      redScale: 0.5,
    });
  });

  it('carries no colour adjustment for a placement whose transform only fades', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_COLOR_TRANSFORM | PLACE_HAS_CHARACTER]),
            uint16(3),
            uint16(7),
            createColorTransform([256, 256, 256, 64], [0, 0, 0, 0]),
            swfString('faded'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const faded = document!.slots[0].target;
    expect(faded.alpha).toBe(0.25);
    expect(getNodeColorAdjustments(faded)).toBeNull();
  });

  it('pre-divides an alpha add so the adjustment and node alpha compose to the authored transform', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_COLOR_TRANSFORM | PLACE_HAS_CHARACTER]),
            uint16(3),
            uint16(7),
            createColorTransform([256, 256, 256, 128], [0, 0, 0, 51]),
            swfString('lifted'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const lifted = document!.slots[0].target;
    const adjustment = getNodeColorAdjustments(lifted)![0] as ColorScaleBiasAdjustment;
    // SWF wants A * 0.5 + 0.2. The adjustment biases by 0.4 and node alpha halves the sum.
    expect(lifted.alpha).toBe(0.5);
    expect(adjustment.colorScaleBias.alphaBias).toBeCloseTo(0.4, 10);
    expect((1 + adjustment.colorScaleBias.alphaBias) * lifted.alpha).toBeCloseTo(1 * 0.5 + 0.2, 10);
  });

  it('replays a per-frame colour transform onto the instance the move targets', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_COLOR_TRANSFORM | PLACE_HAS_CHARACTER]),
            uint16(3),
            uint16(7),
            createColorTransform([128, 256, 256, 256], [0, 0, 0, 0]),
            swfString('shifting'),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(
            new Uint8Array([PLACE_MOVE | PLACE_HAS_COLOR_TRANSFORM]),
            uint16(3),
            createColorTransform([256, 256, 256, 256], [64, 0, 0, 0]),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        // A move that declares no transform inherits the one already in force.
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_MOVE]), uint16(3))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const root = document!.root as MovieClip;
    const shifting = document!.slots[0].target;
    const first = getNodeColorAdjustments(shifting)![0] as ColorScaleBiasAdjustment;
    expect(first.colorScaleBias.redScale).toBe(0.5);

    gotoAndStopMovieClip(root, 2);
    const second = getNodeColorAdjustments(shifting)![0] as ColorScaleBiasAdjustment;
    expect(second.colorScaleBias.redScale).toBe(1);
    expect(second.colorScaleBias.redBias).toBeCloseTo(64 / 255, 10);

    gotoAndStopMovieClip(root, 3);
    expect(getNodeColorAdjustments(shifting)![0]).toBe(second);
  });

  it('tints through a legacy PlaceObject colour transform, which carries no alpha channel', () => {
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
          TAG_PLACE_OBJECT,
          joinBytes(
            uint16(7),
            uint16(3),
            createMatrix(1, 0, 0, 1, 0, 0),
            createColorTransform([128, 256, 256], [0, 0, 0]),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const placed = getNodeChildren(document!.root)[0];
    const adjustment = getNodeColorAdjustments(placed)![0] as ColorScaleBiasAdjustment;
    expect(placed.alpha).toBe(1);
    expect(adjustment.colorScaleBias).toMatchObject({ alphaBias: 0, alphaScale: 1, redScale: 0.5 });
  });

  it('folds a fixed-function PlaceObject3 blend mode onto the node', () => {
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_3,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER, PLACE3_HAS_BLEND_MODE]),
            uint16(3),
            uint16(7),
            swfString('multiplied'),
            new Uint8Array([SWF_BLEND_MULTIPLY]),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(document!.slots[0].target.blendMode).toBe(BlendMode.Multiply);
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

  it('imports every timeline stopped, on its own playhead, with looping already the play mode', () => {
    // Flash plays the root and every nested clip automatically and forever. Flight does neither on its
    // own: a document is inert until a caller plays it, and each clip advances only when that clip is
    // updated. Both are deliberate, and both are what an author expects to be free — so they are pinned
    // here rather than left to be rediscovered by a sample that renders one frame and stops.
    const document = createScene2DFromSwf(
      createSwf([
        createTag(
          TAG_DEFINE_SPRITE,
          joinBytes(
            uint16(20),
            uint16(2),
            createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(7))),
            createTag(TAG_SHOW_FRAME),
            createTag(TAG_REMOVE_OBJECT_2, uint16(1)),
            createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(2), uint16(8))),
            createTag(TAG_SHOW_FRAME),
            createTag(TAG_END),
          ),
        ),
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER]), uint16(1), uint16(20), swfString('panel')),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const root = document!.root as MovieClip;
    const panel = document!.slots[0].target as MovieClip;

    // Stopped, but already set to loop — so playing one is all it takes for it to run forever.
    expect(root.data.timeline?.isPlaying).toBe(false);
    expect(panel.data.timeline?.isPlaying).toBe(false);
    expect(root.data.timeline?.playMode).toBe('loop');
    expect(panel.data.timeline?.playMode).toBe('loop');

    // Playing and updating the root advances the root alone; the nested clip has its own playhead and
    // its own update, which is why a whole-document animation needs every clip played and updated.
    // One frame's worth of time at the header's 24fps, so the step is a frame rather than a wrap.
    const frameMs = 1000 / 24;
    playMovieClip(root);
    updateMovieClip(root, frameMs);
    expect(getMovieClipCurrentFrame(root)).toBe(2);
    expect(getMovieClipCurrentFrame(panel)).toBe(1);

    playMovieClip(panel);
    updateMovieClip(panel, frameMs);
    expect(getMovieClipCurrentFrame(panel)).toBe(2);

    // And past the last frame it wraps rather than stopping, with no frame script involved.
    updateMovieClip(panel, frameMs);
    expect(getMovieClipCurrentFrame(panel)).toBe(1);
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

  it('materializes an unnamed video stream through eleven consecutive move records without pixels', () => {
    const timelineTags: Uint8Array[] = [
      createTag(
        TAG_DEFINE_VIDEO_STREAM,
        joinBytes(uint16(4), uint16(12), uint16(320), uint16(180), new Uint8Array([0x07, 2])),
      ),
      createTag(
        TAG_PLACE_OBJECT_2,
        joinBytes(
          new Uint8Array([PLACE_HAS_CHARACTER | PLACE_HAS_MATRIX]),
          uint16(2),
          uint16(4),
          createMatrix(1, 0, 0, 1, 0, 0),
        ),
      ),
      createTag(TAG_VIDEO_FRAME, joinBytes(uint16(4), uint16(0), new Uint8Array([0xde, 0xad, 0]))),
      createTag(TAG_SHOW_FRAME),
    ];
    for (let move = 1; move <= 11; move++) {
      timelineTags.push(
        createTag(
          TAG_PLACE_OBJECT_2,
          joinBytes(new Uint8Array([PLACE_MOVE | PLACE_HAS_RATIO]), uint16(2), uint16(move)),
        ),
        // The packet stays a bounded unsupported payload: it neither rejects the file nor supplies a
        // texture source, even while the character itself participates in every frame.
        createTag(TAG_VIDEO_FRAME, joinBytes(uint16(4), uint16(move), new Uint8Array([0xde, 0xad, move]))),
        createTag(TAG_SHOW_FRAME),
      );
    }
    timelineTags.push(createTag(TAG_END));

    const document = createScene2DFromSwf(createSwf(timelineTags))!;
    const root = document.root as MovieClip;
    const video = getNodeChildren(root)[0] as Sprite;

    expect(document.slots).toEqual([]);
    expect(getMovieClipTotalFrames(root)).toBe(12);
    expect(video.kind).toBe(SpriteKind);
    expect(getNodeLocalBoundsRectangle(video)).toMatchObject({ height: 180, width: 320, x: 0, y: 0 });
    expect(video.data.texture?.dimension).toBe('2d');
    expect(video.data.texture === null ? undefined : getTextureSource(video.data.texture)).toBeNull();
    expect(video.data.texture?.sampler).toMatchObject({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmaps: false,
    });

    const observed = Array.from({ length: 12 }, (_, frame) => {
      gotoAndStopMovieClip(root, frame + 1);
      const matrix = getNodeLocalMatrix(video);
      return {
        children: [...getNodeChildren(root)],
        matrix: { a: matrix.a, b: matrix.b || 0, c: matrix.c || 0, d: matrix.d, tx: matrix.tx, ty: matrix.ty || 0 },
      };
    });
    expect(observed).toEqual(
      Array.from({ length: 12 }, () => ({
        children: [video],
        matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      })),
    );
  });

  it('instantiates an exported video stream as a sourceless Sprite', () => {
    const source = createSwf([
      createTag(
        TAG_DEFINE_VIDEO_STREAM,
        joinBytes(uint16(13), uint16(10), uint16(320), uint16(180), new Uint8Array([0, 2])),
      ),
      createTag(TAG_EXPORT_ASSETS, joinBytes(uint16(1), uint16(13), swfString('Video'))),
      createTag(TAG_END),
    ]);
    const symbol = createScene2DSymbolFromSwf(source, 'Video')!;

    expect(symbol.slots).toEqual([]);
    expect(symbol.root.kind).toBe(SpriteKind);
    expect(getNodeLocalBoundsRectangle(symbol.root)).toMatchObject({ height: 180, width: 320, x: 0, y: 0 });
    const texture = (symbol.root as Sprite).data.texture;
    expect(texture === null ? undefined : getTextureSource(texture)).toBeNull();
    expect(texture?.sampler).toMatchObject({ magFilter: 'nearest', minFilter: 'nearest', mipmaps: false });
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

describe('createScene2DFromSwf import diagnostics', () => {
  // A clean parse is two claims: the values are right AND THE PARSER IS NOT COMPLAINING. Every other test
  // in this file checks the first. This checks the second — the one that catches a tag walk that
  // desynchronised and still left the asserted fields looking plausible, which is the failure mode a
  // length-prefixed tag format has most of.
  //
  // Skip is excluded rather than the list asserted empty: a well-formed SWF may legitimately use a feature
  // this importer does not model, and reporting that is correct behaviour on correct input. What must not
  // appear is anything of higher severity — the importer may say "I do not model this", never "I could not
  // read this".
  it('raises no data-integrity diagnostic for a well-formed file', () => {
    const crumbs = collectImportDiagnostics((sink) => {
      createScene2DFromSwf(
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
        sink,
      );
    });

    const integrity = crumbs.filter((crumb) => crumb.severity !== ImportDiagnosticSeverity.Skip);
    expect(
      integrity.map((crumb) => crumb.kind),
      `a good SWF made the importer complain: ${integrity.map((c) => c.kind).join(', ')}`,
    ).toEqual([]);
  });

  it('reports an unreadable container as a Reject naming which check refused it', () => {
    const notSwf = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(notSwf, sink)).toBeNull();
    });

    expect(diagnostics.map((entry) => entry.kind)).toEqual(['swf.invalid-signature']);
    expect(diagnostics[0].severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(diagnostics[0].origin).toBe('uncompressSwfSource');
  });

  it('separates an unregistered decompressor from a corrupt body, which share one null sentinel', () => {
    const uncompressed = createSwf([createTag(TAG_SHOW_FRAME), createTag(TAG_END)]);
    const compressed = joinBytes(uncompressed.subarray(0, 8), uncompressed.subarray(8));
    compressed[0] = 0x43;

    // Nothing registered: the file is readable after one registration, which is not the same failure as
    // a corrupt stream even though both come back null.
    const unregistered = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(compressed, sink)).toBeNull();
    });
    expect(unregistered.map((entry) => entry.kind)).toEqual(['swf.no-decompressor-registered']);
    expect(unregistered[0]!.severity).toBe(ImportDiagnosticSeverity.Reject);

    registerDecompressor(Compression.Deflate, () => null);
    try {
      const failed = collectImportDiagnostics((sink) => {
        expect(createScene2DFromSwf(compressed, sink)).toBeNull();
      });
      expect(failed.map((entry) => entry.kind)).toEqual(['swf.decompression-failed']);
      expect(failed[0]!.severity).toBe(ImportDiagnosticSeverity.Reject);
    } finally {
      unregisterDecompressor(Compression.Deflate);
    }
  });

  it('records nothing at all when the caller engages no collector', () => {
    const notSwf = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    // The whole seam is opt-in: the ordinary call must not build a crumb, so this asserts the shape of
    // the default path rather than any particular diagnostic.
    expect(createScene2DFromSwf(notSwf)).toBeNull();
    expect(collectImportDiagnostics(() => {})).toEqual([]);
  });

  it('reports a deliberately declined tag as a Skip, which is correct behaviour rather than failure', () => {
    // VideoFrame payloads are codec packets this importer does not carry. The document still imports;
    // what the crumb adds is that a caller can now tell "declined on purpose" from "silently lost".
    const file = createSwf([
      createTag(
        TAG_DEFINE_VIDEO_STREAM,
        joinBytes(uint16(4), uint16(1), uint16(16), uint16(16), new Uint8Array([0x01, 2])),
      ),
      createTag(61, joinBytes(uint16(4), uint16(0), new Uint8Array([0, 0, 0, 0]))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const declined = diagnostics.filter((entry) => entry.kind === 'swf.video-frame-payload');
    expect(declined).toHaveLength(1);
    expect(declined[0].severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(declined[0].detail).toEqual({ capability: 'swf.video.video-frame', tag: 61 });
  });

  it('stays silent on metadata tags, whose absence costs a document nothing', () => {
    // The line this asserts is the one that keeps the report usable: a caller filtering crumbs should not
    // have to skip past authoring metadata to find the entries that mean something.
    const file = createSwf([
      createTag(69, new Uint8Array([0, 0, 0, 0])),
      createTag(77, swfString('<rdf/>')),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    expect(diagnostics).toEqual([]);
  });

  it('reports an unreadable shape body as a Recover, since the placeholder still places and sizes', () => {
    // A body the decoder cannot read costs that character's drawing and nothing else, so the honest
    // outcome is Recover: the document still imports and the character still has its authored bounds.
    const file = createSwf([
      createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(1), createRectangle(0, 20, 0, 20), new Uint8Array([0xff]))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const recovered = diagnostics.filter((entry) => entry.kind === 'swf.shape-body-unreadable');
    expect(recovered).toHaveLength(1);
    expect(recovered[0].severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(recovered[0].detail).toEqual({ capability: 'swf.shape.define-shape', characterId: 1, version: 1 });
  });

  it('reports a morph definition that does not decode, which otherwise leaves no trace at all', () => {
    // Header reads cleanly — id and both bounds — so the definition is accepted and only the morph body
    // fails. That is the case with no signal: the character is absent and the import still succeeds.
    const body = joinBytes(
      uint16(7),
      createRectangle(0, 200, 0, 200),
      createRectangle(0, 400, 0, 400),
      uint32(0xffff),
      new Uint8Array([0]),
    );
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(createSwf([createTag(TAG_DEFINE_MORPH_SHAPE, body), createTag(TAG_END)]), sink),
      ).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.morph-shape-undecodable');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail).toEqual({ capability: 'swf.morph.define-morph-shape', characterId: 7 });
  });

  it('stays silent about a morph definition that decodes, so the drop entry carries information', () => {
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
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(createSwf([createTag(TAG_DEFINE_MORPH_SHAPE, body), createTag(TAG_END)]), sink),
      ).not.toBeNull();
    });

    expect(diagnostics.filter((entry) => entry.kind === 'swf.morph-shape-undecodable')).toEqual([]);
  });

  it('reports a static text body that does not compose, which the deferred pass would otherwise swallow', () => {
    // A record header declaring a font and a colour, then nothing to read them from. Composition is
    // deferred to after every font is parsed, so this failure surfaces far from the tag that carried it.
    const record = new BitWriter();
    record.writeUnsigned(1, 1);
    record.writeUnsigned(0, 3);
    record.writeUnsigned(1, 1);
    record.writeUnsigned(1, 1);
    record.writeUnsigned(0, 1);
    record.writeUnsigned(0, 1);
    const text = joinBytes(
      uint16(6),
      createRectangle(0, 1024, 0, 1024),
      createMatrix(1, 0, 0, 1, 0, 0),
      new Uint8Array([4, 8]),
      record.toBytes(),
    );
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(createSwf([createTag(TAG_DEFINE_TEXT, text), createTag(TAG_END)]), sink),
      ).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.text-shape-uncomposable');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail).toEqual({ capability: 'swf.text.define-text', characterId: 6 });
  });

  it('stays silent about a static text body that composes, so the drop entry carries information', () => {
    const glyphBytes = new Uint8Array([0x30, 0x28, 0x00, 0x00, 0x40, 0x00]);
    const font = joinBytes(uint16(4), uint16(2), glyphBytes);
    const record = new BitWriter();
    record.writeUnsigned(1, 1);
    record.writeUnsigned(0, 3);
    record.writeUnsigned(1, 1);
    record.writeUnsigned(1, 1);
    record.writeUnsigned(0, 1);
    record.writeUnsigned(0, 1);
    const text = joinBytes(
      uint16(6),
      createRectangle(0, 1024, 0, 1024),
      createMatrix(1, 0, 0, 1, 0, 0),
      new Uint8Array([4, 8]),
      record.toBytes(),
      uint16(4),
      new Uint8Array([0xff, 0x00, 0x00]),
      uint16(1024),
      new Uint8Array([1]),
      packGlyphEntry(0, 600),
      new Uint8Array([0]),
    );
    let document: ReturnType<typeof createScene2DFromSwf> = null;
    const diagnostics = collectImportDiagnostics((sink) => {
      document = createScene2DFromSwf(
        createSwf([
          createTag(TAG_DEFINE_FONT, font),
          createTag(TAG_DEFINE_TEXT, text),
          createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(6))),
          createTag(TAG_SHOW_FRAME),
          createTag(TAG_END),
        ]),
        sink,
      );
    });

    // The silence is only informative if the composition it is silent about actually happened: a run
    // that composed nothing would be silent for the wrong reason and prove nothing.
    expect((getNodeChildren(document!.root)[0] as Shape).kind).toBe(ShapeKind);
    expect(diagnostics.filter((entry) => entry.kind === 'swf.text-shape-uncomposable')).toEqual([]);
  });

  it('reports an edit text body that does not parse, which otherwise loses the field with no signal', () => {
    // HasFont is set and the font id and height that must follow it are not there.
    const field = joinBytes(uint16(12), createRectangle(0, 4000, 0, 800), new Uint8Array([0x80 | 0x01, 0x00]));
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(createSwf([createTag(TAG_DEFINE_EDIT_TEXT, field), createTag(TAG_END)]), sink),
      ).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.edit-text-unparseable');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail).toEqual({ capability: 'swf.text.define-edit-text', characterId: 12 });
  });

  it('stays silent about an edit text body that parses, so the drop entry carries information', () => {
    const field = joinBytes(
      uint16(12),
      createRectangle(0, 4000, 0, 800),
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
    let document: ReturnType<typeof createScene2DFromSwf> = null;
    const diagnostics = collectImportDiagnostics((sink) => {
      document = createScene2DFromSwf(
        createSwf([
          createTag(TAG_DEFINE_EDIT_TEXT, field),
          createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(12))),
          createTag(TAG_SHOW_FRAME),
          createTag(TAG_END),
        ]),
        sink,
      );
    });

    // Non-vacuous: a run that parsed no edit text would be silent for the wrong reason.
    expect(getNodeChildren(document!.root)).toHaveLength(1);
    expect(diagnostics.filter((entry) => entry.kind === 'swf.edit-text-unparseable')).toEqual([]);
  });

  it('reports an ABC blob that yields no frame scripts, naming which of the two DoABC forms it was', () => {
    // A DoABC payload whose ABC body is not readable. The two tag forms are separate capabilities, so
    // the entry has to name which one it was or it cannot be joined to either.
    const named = joinBytes(uint32(0), swfString('frame'), new Uint8Array([0xff, 0xff, 0xff, 0xff]));
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(createSwf([createTag(TAG_DO_ABC, named), createTag(TAG_END)]), sink)).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.abc-frame-scripts-unreadable');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail).toEqual({ capability: 'swf.script.do-abc' });
  });

  it('names the anonymous DoABC form separately, since the two are different capabilities', () => {
    const anonymous = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(createSwf([createTag(TAG_DO_ABC_ANONYMOUS, anonymous), createTag(TAG_END)]), sink),
      ).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.abc-frame-scripts-unreadable');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].detail).toEqual({ capability: 'swf.script.do-abc-anonymous' });
  });

  it('reports a declared blend mode left unread behind a filter list that did not finish', () => {
    // Filter id 0xff has no known payload width, so the list cannot be walked to its end and the blend
    // byte behind it is unreachable. The placement keeps everything else, which is why this is silent.
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(
          createSwf([
            createTag(
              TAG_PLACE_OBJECT_3,
              joinBytes(
                new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER, PLACE3_HAS_FILTER_LIST | PLACE3_HAS_BLEND_MODE]),
                uint16(3),
                uint16(7),
                swfString('filtered'),
                new Uint8Array([1, 0xff]),
                new Uint8Array([SWF_BLEND_MULTIPLY]),
              ),
            ),
            createTag(TAG_SHOW_FRAME),
            createTag(TAG_END),
          ]),
          sink,
        ),
      ).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.blend-mode-behind-unread-filters');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail).toEqual({ capability: 'swf.placement.blend-mode' });
  });

  it('stays silent when a declared blend mode is reachable, so the drop entry carries information', () => {
    let document: ReturnType<typeof createScene2DFromSwf> = null;
    const diagnostics = collectImportDiagnostics((sink) => {
      document = createScene2DFromSwf(
        createSwf([
          createTag(
            TAG_PLACE_OBJECT_3,
            joinBytes(
              new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER, PLACE3_HAS_BLEND_MODE]),
              uint16(3),
              uint16(7),
              swfString('multiplied'),
              new Uint8Array([SWF_BLEND_MULTIPLY]),
            ),
          ),
          createTag(TAG_SHOW_FRAME),
          createTag(TAG_END),
        ]),
        sink,
      );
    });

    // Non-vacuous: the blend mode was actually read and applied.
    expect(document!.slots[0].target.blendMode).toBe(BlendMode.Multiply);
    expect(diagnostics.filter((entry) => entry.kind === 'swf.blend-mode-behind-unread-filters')).toEqual([]);
  });

  it('counts the children a sprite bounds union could not include, since the box survives smaller', () => {
    // Character 7 is defined and character 9 is not. The union covers 7 alone, so the sprite's authored
    // box is real and short — the diminished case a count catches and an existence check cannot.
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(
          createSwf([
            createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(0, 200, 0, 100))),
            createTag(
              TAG_DEFINE_SPRITE,
              joinBytes(
                uint16(20),
                uint16(1),
                createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(7))),
                createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(2), uint16(9))),
                createTag(TAG_SHOW_FRAME),
                createTag(TAG_END),
              ),
            ),
            createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(20))),
            createTag(TAG_SHOW_FRAME),
            createTag(TAG_END),
          ]),
          sink,
        ),
      ).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.sprite-bounds-short');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail).toEqual({
      capability: 'swf.timeline.define-sprite',
      characterId: 20,
      missingChildren: 1,
    });
  });

  it('stays silent when every child of a sprite contributes its bounds', () => {
    let document: ReturnType<typeof createScene2DFromSwf> = null;
    const diagnostics = collectImportDiagnostics((sink) => {
      document = createScene2DFromSwf(
        createSwf([
          createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(0, 200, 0, 100))),
          createTag(
            TAG_DEFINE_SPRITE,
            joinBytes(
              uint16(20),
              uint16(1),
              createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(7))),
              createTag(TAG_SHOW_FRAME),
              createTag(TAG_END),
            ),
          ),
          createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(20))),
          createTag(TAG_SHOW_FRAME),
          createTag(TAG_END),
        ]),
        sink,
      );
    });

    // Non-vacuous: the sprite exists and its union was actually computed.
    expect(getNodeChildren(document!.root)).toHaveLength(1);
    expect(diagnostics.filter((entry) => entry.kind === 'swf.sprite-bounds-short')).toEqual([]);
  });

  it('reports an advanced blend that had no node to carry it, which the appearance report alone holds', () => {
    // An unnamed placement of a character that was never defined earns no node, so the appearance report
    // — the only carrier for advanced blends and filter lists — has nothing to attach to.
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(
          createSwf([
            createTag(
              TAG_PLACE_OBJECT_3,
              joinBytes(
                new Uint8Array([PLACE_HAS_CHARACTER, PLACE3_HAS_BLEND_MODE]),
                uint16(1),
                uint16(7),
                new Uint8Array([SWF_BLEND_OVERLAY]),
              ),
            ),
            createTag(TAG_SHOW_FRAME),
            createTag(TAG_END),
          ]),
          sink,
        ),
      ).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.appearance-without-node');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail).toEqual({ capability: 'swf.placement.blend-mode', frame: 1 });
  });

  it('stays silent when an advanced blend has a node to carry it, so the drop entry carries information', () => {
    const diagnostics = collectImportDiagnostics((sink) => {
      const result = createScene2DImportFromSwf(
        createSwf([
          createTag(
            TAG_PLACE_OBJECT_3,
            joinBytes(
              new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER, PLACE3_HAS_BLEND_MODE]),
              uint16(3),
              uint16(7),
              swfString('overlaid'),
              new Uint8Array([SWF_BLEND_OVERLAY]),
            ),
          ),
          createTag(TAG_SHOW_FRAME),
          createTag(TAG_END),
        ]),
        sink,
      );
      // Non-vacuous: the appearance really was recorded against a node.
      expect(result!.appearances).toHaveLength(1);
    });

    expect(diagnostics.filter((entry) => entry.kind === 'swf.appearance-without-node')).toEqual([]);
  });

  it('reports a reused font character id, the one case where the document imports and is simply wrong', () => {
    // Two DefineFont tags claim id 4. The second replaces the first; the document imports, the font
    // exists, and it is the wrong font — the substituted case no existence check and no count can see.
    const glyphBytes = new Uint8Array([0x30, 0x28, 0x00, 0x00, 0x40, 0x00]);
    const font = joinBytes(uint16(4), uint16(2), glyphBytes);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(
          createSwf([createTag(TAG_DEFINE_FONT, font), createTag(TAG_DEFINE_FONT, font), createTag(TAG_END)]),
          sink,
        ),
      ).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.font-character-id-reused');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail).toEqual({ capability: 'swf.font.define-font', characterId: 4 });
  });

  it('stays silent about a font whose character id is used once, so the entry carries information', () => {
    const glyphBytes = new Uint8Array([0x30, 0x28, 0x00, 0x00, 0x40, 0x00]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(
          createSwf([
            createTag(TAG_DEFINE_FONT, joinBytes(uint16(4), uint16(2), glyphBytes)),
            createTag(TAG_DEFINE_FONT, joinBytes(uint16(5), uint16(2), glyphBytes)),
            createTag(TAG_END),
          ]),
          sink,
        ),
      ).not.toBeNull();
    });

    expect(diagnostics.filter((entry) => entry.kind === 'swf.font-character-id-reused')).toEqual([]);
  });

  it('reports an edit text whose font id resolves to no name, leaving the field sized but unfamilied', () => {
    // The field keeps its box, colour and size and simply has no font family. Asserting the box survives
    // is what makes this the diminished case rather than a missing field.
    const field = joinBytes(
      uint16(12),
      createRectangle(0, 4000, 0, 800),
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
    let document: ReturnType<typeof createScene2DFromSwf> = null;
    const diagnostics = collectImportDiagnostics((sink) => {
      document = createScene2DFromSwf(
        createSwf([
          createTag(TAG_DEFINE_EDIT_TEXT, field),
          createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(12))),
          createTag(TAG_SHOW_FRAME),
          createTag(TAG_END),
        ]),
        sink,
      );
    });

    expect(getNodeChildren(document!.root)).toHaveLength(1);
    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.edit-text-font-name-unresolved');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail).toEqual({ capability: 'swf.text.define-edit-text', fontId: 7 });
  });

  it('reports a declined frame script through the full import path, not only the reader in isolation', () => {
    // A fire proof at the reader shows the wire fires; it does not show production reaches the branch.
    // Family 8 was reachable only by a route other than the one predicted, so this asks the same question
    // of the frame-script wire by carrying a real DoABC payload through createScene2DFromSwf.
    const abc = buildFrameScriptAbc(1);
    const payload = joinBytes(uint32(0), swfString('frame'), abc);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(createSwf([createTag(TAG_DO_ABC, payload), createTag(TAG_END)]), sink),
      ).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.abc-frame-script-declined');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].detail).toEqual({ frame: 1, reason: 'commands-declined' });
  });

  it('reports an undecodable morph for DefineMorphShape2, not only the generation the wire was written on', () => {
    // A wire carrying a version ternary is only proven for the branch a test exercises. This is the same
    // check already applied to the shape generations, applied to the morph wire.
    const body = joinBytes(
      uint16(7),
      createRectangle(0, 200, 0, 200),
      createRectangle(0, 400, 0, 400),
      createRectangle(0, 200, 0, 200),
      createRectangle(0, 400, 0, 400),
      new Uint8Array([0]),
      uint32(0xffff),
      new Uint8Array([0]),
    );
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(createSwf([createTag(TAG_DEFINE_MORPH_SHAPE_2, body), createTag(TAG_END)]), sink),
      ).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.morph-shape-undecodable');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].detail).toEqual({ capability: 'swf.morph.define-morph-shape-2', characterId: 7 });
  });

  it('reports an uncomposable body for DefineText2, not only the generation the wire was written on', () => {
    const record = new BitWriter();
    record.writeUnsigned(1, 1);
    record.writeUnsigned(0, 3);
    record.writeUnsigned(1, 1);
    record.writeUnsigned(1, 1);
    record.writeUnsigned(0, 1);
    record.writeUnsigned(0, 1);
    const text = joinBytes(
      uint16(6),
      createRectangle(0, 1024, 0, 1024),
      createMatrix(1, 0, 0, 1, 0, 0),
      new Uint8Array([4, 8]),
      record.toBytes(),
    );
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(createSwf([createTag(TAG_DEFINE_TEXT_2, text), createTag(TAG_END)]), sink),
      ).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.text-shape-uncomposable');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].detail).toEqual({ capability: 'swf.text.define-text-2', characterId: 6 });
  });

  it('reports a reused character id for DefineFont2, not only the generation the wire was written on', () => {
    // A glyph-less DefineFont2 still parses and still claims the id, which is all the duplicate needs.
    const font2 = joinBytes(uint16(4), new Uint8Array([0, 0, 0]), uint16(0), uint16(0));
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(
          createSwf([createTag(TAG_DEFINE_FONT_2, font2), createTag(TAG_DEFINE_FONT_2, font2), createTag(TAG_END)]),
          sink,
        ),
      ).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.font-character-id-reused');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].detail).toEqual({ capability: 'swf.font.define-font-2', characterId: 4 });
  });

  it('stays silent when an edit text font id does resolve, so the unresolved entry carries information', () => {
    // Recorded earlier as an absent silence proof: it needs a DefineFont2 that parses, and none existed.
    // The version-routing work produced one — a glyph-less DefineFont2 parses and carries a name — so the
    // hole closes. Worth noting the fixture came from unrelated work rather than from trying harder.
    const font2 = joinBytes(uint16(7), new Uint8Array([0, 0, 5]), swfBytes('Arial'), uint16(0), uint16(0));
    const field = joinBytes(
      uint16(12),
      createRectangle(0, 4000, 0, 800),
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
    let document: ReturnType<typeof createScene2DFromSwf> = null;
    const diagnostics = collectImportDiagnostics((sink) => {
      document = createScene2DFromSwf(
        createSwf([
          createTag(TAG_DEFINE_FONT_2, font2),
          createTag(TAG_DEFINE_EDIT_TEXT, field),
          createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(12))),
          createTag(TAG_SHOW_FRAME),
          createTag(TAG_END),
        ]),
        sink,
      );
    });

    // Non-vacuous: the field exists, so the resolver really ran against a font id that resolved.
    expect(getNodeChildren(document!.root)).toHaveLength(1);
    expect(diagnostics.filter((entry) => entry.kind === 'swf.edit-text-font-name-unresolved')).toEqual([]);
  });

  it('stays silent about an anonymous DoABC it does obey, so the drop entry carries information', () => {
    // An anonymous DoABC carries the raw ABC with no flags-and-name header, so the shared builder is
    // enough on its own. Recorded earlier as an absent silence proof; the helper closed it.
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        createScene2DFromSwf(
          createSwf([createTag(TAG_DO_ABC_ANONYMOUS, buildFrameScriptAbc()), createTag(TAG_END)]),
          sink,
        ),
      ).not.toBeNull();
    });

    expect(diagnostics.filter((entry) => entry.kind === 'swf.abc-frame-scripts-unreadable')).toEqual([]);
    expect(diagnostics.filter((entry) => entry.kind === 'swf.abc-frame-script-declined')).toEqual([]);
  });

  it('stays silent about a DefineText2 body that composes, so the drop entry carries information', () => {
    const glyphBytes = new Uint8Array([0x30, 0x28, 0x00, 0x00, 0x40, 0x00]);
    const font = joinBytes(uint16(4), uint16(2), glyphBytes);
    const record = new BitWriter();
    record.writeUnsigned(1, 1);
    record.writeUnsigned(0, 3);
    record.writeUnsigned(1, 1);
    record.writeUnsigned(1, 1);
    record.writeUnsigned(0, 1);
    record.writeUnsigned(0, 1);
    const text = joinBytes(
      uint16(6),
      createRectangle(0, 1024, 0, 1024),
      createMatrix(1, 0, 0, 1, 0, 0),
      new Uint8Array([4, 8]),
      record.toBytes(),
      uint16(4),
      // DefineText2 records carry RGBA where DefineText carries RGB — the version difference that makes
      // this a separate silence proof rather than the same one relabelled.
      new Uint8Array([0xff, 0x00, 0x00, 0xff]),
      uint16(1024),
      new Uint8Array([1]),
      packGlyphEntry(0, 600),
      new Uint8Array([0]),
    );
    let document: ReturnType<typeof createScene2DFromSwf> = null;
    const diagnostics = collectImportDiagnostics((sink) => {
      document = createScene2DFromSwf(
        createSwf([
          createTag(TAG_DEFINE_FONT, font),
          createTag(TAG_DEFINE_TEXT_2, text),
          createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(6))),
          createTag(TAG_SHOW_FRAME),
          createTag(TAG_END),
        ]),
        sink,
      );
    });

    // Non-vacuous: a run that composed nothing would be silent for the wrong reason.
    expect((getNodeChildren(document!.root)[0] as Shape).kind).toBe(ShapeKind);
    expect(diagnostics.filter((entry) => entry.kind === 'swf.text-shape-uncomposable')).toEqual([]);
  });

  it('reports each whole-document header rejection with its own cause, not one shared null', () => {
    // Every case below loses the entire document. Before these wires the caller got one null and could
    // not tell a truncated header from an unregistered decompressor, which IS reported upstream.
    const kindFor = (file: Uint8Array): readonly string[] =>
      collectImportDiagnostics((sink) => {
        expect(createScene2DFromSwf(file, sink)).toBeNull();
      }).map((entry) => entry.kind);

    // Version 0 is invalid however well-formed the rest is.
    const zeroVersion = joinBytes(new Uint8Array([0x46, 0x57, 0x53, 0]), uint32(64), createRectangle(0, 10, 0, 10));
    expect(kindFor(zeroVersion)).toContain('swf.header-fields-invalid');

    // A declared length that passes the minimum, and a stage RECT claiming 31 bits per field with far
    // too few bytes behind it inside that length.
    const noStage = joinBytes(new Uint8Array([0x46, 0x57, 0x53, 9]), uint32(12), new Uint8Array([0xf8, 0, 0, 0]));
    expect(kindFor(noStage)).toContain('swf.stage-bounds-unreadable');

    // A stage RECT that reads, then no frame rate or frame count behind it.
    const stage = createRectangle(0, 2000, 0, 1000);
    const noFrameRate = joinBytes(new Uint8Array([0x46, 0x57, 0x53, 9]), uint32(8 + stage.length), stage);
    expect(kindFor(noFrameRate)).toContain('swf.header-truncated');
  });

  it('reports a discarded JPEG alpha stream as a Skip, since alpha compositing is not implemented yet', () => {
    const jpeg3 = createJpegHeader(23, 17);
    const file = createSwf([
      createTag(TAG_DEFINE_BITS_JPEG_3, joinBytes(uint16(16), uint32(jpeg3.length), jpeg3, new Uint8Array([1, 2, 3]))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.jpeg-alpha-stream');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(dropped[0].detail).toEqual({
      capability: 'swf.bitmap.define-bits-jpeg-3',
      characterId: 16,
      discardedBytes: 3,
    });
  });

  it('reports a legacy split JPEG with no tables in the file as a Drop', () => {
    const file = createSwf([
      createTag(TAG_DEFINE_BITS, joinBytes(uint16(9), new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.jpeg-tables-missing');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail).toEqual({ capability: 'swf.bitmap.define-bits-jpeg-tables', characterId: 9 });
  });

  it('reports scene names as a Skip, since labels import and the named range has no subject', () => {
    const file = createSwf([
      createTag(
        TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA,
        joinBytes(encodedUint32(1), encodedUint32(0), swfString('Scene 1'), encodedUint32(0)),
      ),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const skipped = diagnostics.filter((entry) => entry.kind === 'swf.scene-names');
    expect(skipped).toHaveLength(1);
    expect(skipped[0].severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(skipped[0].detail).toEqual({
      capability: 'swf.timeline.define-scene-and-frame-label-data',
      sceneCount: 1,
    });
  });

  it('reports a frame script declined for carrying more than playback commands', () => {
    // 0x96 push, then a non-playback action: the block is declined WHOLE, because honouring the legible
    // half would misrepresent the frame. The crumb is what tells a caller the frame had a script at all.
    const file = createSwf([
      createTag(TAG_DO_ACTION, new Uint8Array([0x96, 0x02, 0x00, 0x08, 0x00, 0x3d, 0x00])),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const skipped = diagnostics.filter((entry) => entry.kind === 'swf.frame-script-declined');
    expect(skipped).toHaveLength(1);
    expect(skipped[0].severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(skipped[0].detail).toEqual({ capability: 'swf.script.do-action', frame: 1 });
  });

  it('reports an init action declined the same way DoAction is, which it silently did not', () => {
    // The identical decline four lines above the DoAction case reported nothing. Found by the silent-drop
    // shape sweep, not by reading — three passes over this file read both branches and saw no asymmetry.
    const file = createSwf([
      createTag(TAG_DO_INIT_ACTION, joinBytes(uint16(20), new Uint8Array([0x96, 0x02, 0x00, 0x08, 0x00, 0x3d, 0x00]))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const skipped = diagnostics.filter((entry) => entry.kind === 'swf.frame-script-declined');
    expect(skipped).toHaveLength(1);
    expect(skipped[0].severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(skipped[0].detail).toEqual({ capability: 'swf.script.do-init-action', characterId: 20 });
  });

  it('stays silent about an init action it does obey, so the skip entry carries information', () => {
    const file = createSwf([
      createTag(TAG_DO_INIT_ACTION, joinBytes(uint16(20), new Uint8Array([0x07, 0x00]))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    expect(diagnostics.filter((entry) => entry.kind === 'swf.frame-script-declined')).toEqual([]);
  });

  it('reports nested masks collapsing, since the outer one is not applied at all', () => {
    // Two clip depths covering one instance: Flight carries one clip per node, so the outer mask is
    // simply not applied and the instance shows more than the file said. The crumb is the only signal.
    const file = createSwf([
      createTag(
        TAG_PLACE_OBJECT_2,
        joinBytes(new Uint8Array([PLACE_HAS_CLIP_DEPTH | PLACE_HAS_CHARACTER]), uint16(1), uint16(1), uint16(9)),
      ),
      createTag(
        TAG_PLACE_OBJECT_2,
        joinBytes(new Uint8Array([PLACE_HAS_CLIP_DEPTH | PLACE_HAS_CHARACTER]), uint16(2), uint16(2), uint16(9)),
      ),
      createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(3), uint16(3))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      createScene2DFromSwf(file, sink);
    });

    const collapsed = diagnostics.filter((entry) => entry.kind === 'swf.nested-mask-collapsed');
    expect(collapsed.length).toBeGreaterThan(0);
    expect(collapsed[0].severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(collapsed[0].detail?.capability).toBe('swf.placement.clip-depth');
    expect(collapsed[0].detail?.covering).toBe(2);

    // The masks name characters with no decoded geometry, so the same fixture exercises clip-depth's
    // other loss path. Both paths must be proven for the capability to count as instrumented.
    const unmasked = diagnostics.filter((entry) => entry.kind === 'swf.mask-without-geometry');
    expect(unmasked.length).toBeGreaterThan(0);
    expect(unmasked[0].severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(unmasked[0].detail?.capability).toBe('swf.placement.clip-depth');
  });

  it('reports a button interaction state other than up, which a still scene does not hold', () => {
    const file = createSwf([
      createTag(
        TAG_DEFINE_BUTTON_2,
        joinBytes(
          uint16(12),
          new Uint8Array([0, 0, 0]),
          new Uint8Array([0x02]),
          uint16(7),
          uint16(1),
          createRectangle(0, 0, 0, 0),
          new Uint8Array([0, 0]),
        ),
      ),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const skipped = diagnostics.filter((entry) => entry.kind === 'swf.button-interaction-state');
    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped[0].severity).toBe(ImportDiagnosticSeverity.Skip);
    // The PAYLOAD, not just the trigger: a crumb that fires correctly while recording something false
    // is a clean positive that is not one. The fixture's non-up record names character 7 with state
    // flags 0x02, and the crumb must say so rather than merely existing.
    expect(skipped[0].detail).toEqual({ characterId: 7, flags: 0x02 });
  });

  it('reports a legacy split JPEG whose halves will not splice into a readable image', () => {
    const file = createSwf([
      createTag(TAG_JPEG_TABLES, new Uint8Array([0xff, 0xd8, 0xff, 0xd9])),
      createTag(TAG_DEFINE_BITS, joinBytes(uint16(9), new Uint8Array([0x01, 0x02, 0x03, 0x04]))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.jpeg-tables-unsplittable');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail).toEqual({ capability: 'swf.bitmap.define-bits-jpeg-tables', characterId: 9 });
  });

  it('reports a font whose glyph table does not decode, which costs the whole font not one glyph', () => {
    // Found by auditing my own trustworthy-silence claim rather than by a failing test: a font that
    // vanishes entirely and a font that imports cleanly both produced no crumb before this.
    const file = createSwf([
      createTag(TAG_DEFINE_FONT_2, joinBytes(uint16(4), new Uint8Array([0xff, 0xff, 0xff, 0xff]))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.font-glyph-table');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail).toEqual({ capability: 'swf.font.define-font-2', characterId: 4 });
  });

  it('reports a non-MP3 sound stream, whose blocks do not concatenate', () => {
    // Stream format 1 (ADPCM) in the high nibble of the stream flags, with a non-zero samples-per-frame
    // so the header actually starts a stream. Only MP3 blocks concatenate, so the rest are a real loss.
    const file = createSwf([
      createTag(18, joinBytes(new Uint8Array([0, 1 << 4]), uint16(1152))),
      createTag(19, new Uint8Array([1, 2, 3, 4])),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const skipped = diagnostics.filter((entry) => entry.kind === 'swf.stream-sound-format');
    expect(skipped).toHaveLength(1);
    expect(skipped[0].severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(skipped[0].detail).toEqual({ capability: 'swf.axis.sound-format-non-mp3', format: 1 });
  });

  it('reports one glyph whose outline does not decode, which costs that glyph and not the font', () => {
    // Two glyphs: the first is a real square, the second is a body the shape reader cannot read. The
    // font still imports — that is the point of the Drop rather than a whole-font failure.
    const glyph = new ShapeWriter();
    glyph.writeStyleBits(1, 0);
    glyph.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    glyph.writeStraightEdge(256, 0);
    glyph.writeStraightEdge(0, 256);
    glyph.writeStraightEdge(-256, 0);
    glyph.writeStraightEdge(0, -256);
    glyph.writeEndShape();
    const good = glyph.toBytes();
    const bad = new Uint8Array([0xff]);
    const offsets = joinBytes(uint16(6), uint16(6 + good.length), uint16(6 + good.length + bad.length));
    const file = createSwf([
      createTag(
        TAG_DEFINE_FONT_2,
        joinBytes(uint16(4), new Uint8Array([0, 0, 0]), uint16(2), offsets, good, bad, new Uint8Array([0x41, 0x42])),
      ),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.font-glyph-outline');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail?.capability).toBe('swf.font.define-font-2');
    expect(dropped[0].detail?.lostGlyphs).toBe(1);
  });

  it('stays silent about a shape, a video stream and a scene table that lose nothing', () => {
    // A SILENCE PROOF IS VACUOUS UNLESS THE CAPABILITY WAS ACTUALLY EXERCISED — silence because the
    // feature was absent proves nothing about the wire. So each assertion below is paired with a positive
    // check that the construct really was imported.
    const writer = new ShapeWriter();
    writer.writeSolidFillStyles([0x3366cc]);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(400, 0);
    writer.writeStraightEdge(0, 400);
    writer.writeStraightEdge(-400, 0);
    writer.writeStraightEdge(0, -400);
    writer.writeEndShape();

    const file = createSwf([
      createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(0, 400, 0, 400), writer.toBytes())),
      createTag(
        TAG_DEFINE_VIDEO_STREAM,
        joinBytes(uint16(4), uint16(1), uint16(16), uint16(16), new Uint8Array([0x01, 2])),
      ),
      // A scene table with zero scenes still carries its label, so the tag is exercised and loses nothing.
      createTag(
        TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA,
        joinBytes(encodedUint32(0), encodedUint32(1), encodedUint32(0), swfString('start')),
      ),
      createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(7))),
      createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(2), uint16(4))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);

    const diagnostics = collectImportDiagnostics((sink) => {
      const document = createScene2DFromSwf(file, sink);
      // The capabilities really were exercised: the shape drew, the video character materialized, and
      // the label survived.
      const children = getNodeChildren(document?.root as Node2D);
      expect(children.length).toBe(2);
      expect(getMovieClipCurrentLabel(document?.root as MovieClip)?.name).toBe('start');
    });

    const kinds = diagnostics.map((entry) => entry.kind);
    expect(kinds).not.toContain('swf.shape-body-unreadable');
    expect(kinds).not.toContain('swf.video-frame-payload');
    expect(kinds).not.toContain('swf.scene-names');
  });

  it('stays silent about a frame script and a mask that lose nothing', () => {
    const mask = new ShapeWriter();
    mask.writeSolidFillStyles([0xffffff]);
    mask.writeLineStyleCount(0);
    mask.writeStyleBits(1, 0);
    mask.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    mask.writeStraightEdge(200, 0);
    mask.writeStraightEdge(0, 200);
    mask.writeStraightEdge(-200, 0);
    mask.writeStraightEdge(0, -200);
    mask.writeEndShape();

    const file = createSwf([
      createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(5), createRectangle(0, 200, 0, 200), mask.toBytes())),
      // One mask with real geometry over one instance: clip-depth is exercised and neither of its two
      // loss paths applies.
      createTag(
        TAG_PLACE_OBJECT_2,
        joinBytes(new Uint8Array([PLACE_HAS_CLIP_DEPTH | PLACE_HAS_CHARACTER]), uint16(1), uint16(5), uint16(3)),
      ),
      createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(2), uint16(5))),
      // A block that is ONLY playback commands is recognized whole, so nothing is declined.
      createTag(TAG_DO_ACTION, new Uint8Array([0x07, 0x00])),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);

    const diagnostics = collectImportDiagnostics((sink) => {
      const document = createScene2DFromSwf(file, sink);
      expect(getMovieClipFrameScript(document?.root as MovieClip, 1)).not.toBeNull();
    });

    const kinds = diagnostics.map((entry) => entry.kind);
    expect(kinds).not.toContain('swf.frame-script-declined');
    expect(kinds).not.toContain('swf.mask-without-geometry');
    expect(kinds).not.toContain('swf.nested-mask-collapsed');
  });

  it('stays silent about a font, a spliced JPEG and a JPEG3 that lose nothing', () => {
    // The three capabilities that fire on the corpus without a silence proof yet. Each assertion is
    // paired with a positive check, so silence cannot come from the construct simply being absent.
    const glyph = new ShapeWriter();
    glyph.writeStyleBits(1, 0);
    glyph.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    glyph.writeStraightEdge(256, 0);
    glyph.writeStraightEdge(0, 256);
    glyph.writeStraightEdge(-256, 0);
    glyph.writeStraightEdge(0, -256);
    glyph.writeEndShape();
    const glyphBytes = glyph.toBytes();
    const tables = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x11, 0x22, 0xff, 0xd9]);
    const jpeg3 = createJpegHeader(23, 17);

    const file = createSwf([
      createTag(
        TAG_DEFINE_FONT_2,
        joinBytes(
          uint16(4),
          new Uint8Array([0, 0, 0]),
          uint16(1),
          joinBytes(uint16(4), uint16(4 + glyphBytes.length)),
          glyphBytes,
          new Uint8Array([0x41]),
        ),
      ),
      createTag(TAG_JPEG_TABLES, tables),
      createTag(TAG_DEFINE_BITS, joinBytes(uint16(9), createJpegHeader(11, 13))),
      // alphaDataOffset equal to the payload length: the colour stream is the whole body, so there is
      // no alpha block to discard and nothing is lost.
      createTag(TAG_DEFINE_BITS_JPEG_3, joinBytes(uint16(16), uint32(jpeg3.length), jpeg3)),
      // Placed, because an image earns a resource only when something samples it — without these the
      // silence below would be silence about constructs that never entered the document.
      createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(9))),
      createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(2), uint16(16))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);

    const diagnostics = collectImportDiagnostics((sink) => {
      const document = createScene2DFromSwf(file, sink);
      // All three constructs really imported: two image resources plus a recoverable font.
      expect(document?.imageResources.length).toBe(2);
      expect(createGlyphOutlineSourcesFromSwf(file)?.size).toBe(1);
    });

    const kinds = diagnostics.map((entry) => entry.kind);
    expect(kinds).not.toContain('swf.font-glyph-table');
    expect(kinds).not.toContain('swf.font-glyph-outline');
    expect(kinds).not.toContain('swf.jpeg-tables-missing');
    expect(kinds).not.toContain('swf.jpeg-tables-unsplittable');
    expect(kinds).not.toContain('swf.jpeg-alpha-stream');
  });

  it('stays silent about an MP3 stream, whose blocks do concatenate', () => {
    // The last capability without a silence proof, and the only one that never fires on the sampled
    // corpus — so it is last by the ordering rather than unimportant. Format 2 is MP3 in the high nibble.
    const file = createSwf([
      createTag(18, joinBytes(new Uint8Array([0, 2 << 4]), uint16(1152))),
      createTag(19, joinBytes(uint16(1), uint16(0), new Uint8Array([0xff, 0xfb, 0x90, 0x00]))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);

    const diagnostics = collectImportDiagnostics((sink) => {
      const document = createScene2DFromSwf(file, sink);
      // The stream really was carried: an MP3 head plus a block produces an audio resource.
      expect(document?.audioResources.length).toBe(1);
    });

    expect(diagnostics.map((entry) => entry.kind)).not.toContain('swf.stream-sound-format');
  });

  it('reports a label naming a frame the timeline never reaches, and stays silent when it does', () => {
    // The second way DefineSceneAndFrameLabelData loses data, found by auditing the CLAIM rather than
    // the wire: swf.scene-names covered the scene table only, while an out-of-range label was filtered
    // out silently and the capability still claimed trustworthy silence.
    const past = createSwf([
      createTag(
        TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA,
        joinBytes(encodedUint32(0), encodedUint32(1), encodedUint32(40), swfString('never')),
      ),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const dropped = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(past, sink)).not.toBeNull();
    }).filter((entry) => entry.kind === 'swf.label-past-last-frame');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail).toEqual({ capability: 'swf.timeline.frame-label', dropped: 1, frames: 1 });

    // A label the timeline does reach loses nothing, so no crumb — and it really did import.
    const reached = createSwf([
      createTag(
        TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA,
        joinBytes(encodedUint32(0), encodedUint32(1), encodedUint32(0), swfString('start')),
      ),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const quiet = collectImportDiagnostics((sink) => {
      const document = createScene2DFromSwf(reached, sink);
      expect(getMovieClipCurrentLabel(document?.root as MovieClip)?.name).toBe('start');
    });
    expect(quiet.map((entry) => entry.kind)).not.toContain('swf.label-past-last-frame');
  });

  it('reports an unreadable body for every shape generation, not just the one the wire was written on', () => {
    // PROPERTY 4 APPLIED TO THE PROOF MAPPING: the shape wire was proven on DefineShape alone while the
    // mapping claimed all four generations. The code path is shared and parameterised by version, so what
    // was untested was the ROUTING — that each tag reaches it and reports its own capability id.
    const file = createSwf([
      createTag(TAG_DEFINE_SHAPE_2, joinBytes(uint16(2), createRectangle(0, 20, 0, 20), new Uint8Array([0xff]))),
      createTag(TAG_DEFINE_SHAPE_3, joinBytes(uint16(3), createRectangle(0, 20, 0, 20), new Uint8Array([0xff]))),
      createTag(
        TAG_DEFINE_SHAPE_4,
        joinBytes(uint16(4), createRectangle(0, 20, 0, 20), createRectangle(0, 20, 0, 20), new Uint8Array([0, 0xff])),
      ),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const capabilities = diagnostics
      .filter((entry) => entry.kind === 'swf.shape-body-unreadable')
      .map((entry) => entry.detail?.capability);
    expect(capabilities).toEqual(['swf.shape.define-shape-2', 'swf.shape.define-shape-3', 'swf.shape.define-shape-4']);
  });

  it('reports an unreadable glyph table for DefineFont and DefineFont3, not only DefineFont2', () => {
    const file = createSwf([
      createTag(TAG_DEFINE_FONT, joinBytes(uint16(6), new Uint8Array([0xff, 0xff]))),
      createTag(TAG_DEFINE_FONT_3, joinBytes(uint16(7), new Uint8Array([0xff, 0xff, 0xff, 0xff]))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const capabilities = diagnostics
      .filter((entry) => entry.kind === 'swf.font-glyph-table')
      .map((entry) => entry.detail?.capability);
    expect(capabilities).toEqual(['swf.font.define-font', 'swf.font.define-font-3']);
  });

  it('reports a discarded alpha stream for DefineBitsJPEG4, whose header differs from JPEG3', () => {
    const jpeg4 = createJpegHeader(31, 19);
    const file = createSwf([
      // JPEG4 carries a deblocking uint16 between the offset and the payload, so its routing is a
      // genuinely different path from JPEG3's and needs its own proof.
      createTag(
        TAG_DEFINE_BITS_JPEG_4,
        joinBytes(uint16(17), uint32(jpeg4.length + 2), uint16(0), jpeg4, new Uint8Array([4, 5, 6])),
      ),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(file, sink)).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.jpeg-alpha-stream');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].detail).toEqual({
      capability: 'swf.bitmap.define-bits-jpeg-4',
      characterId: 17,
      discardedBytes: 3,
    });
  });

  it('names the symbol a caller asked for that the file does not export', () => {
    const file = createSwf([createTag(TAG_SHOW_FRAME), createTag(TAG_END)]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DSymbolFromSwf(file, 'absent', sink)).toBeNull();
    });

    expect(diagnostics.map((entry) => entry.kind)).toEqual(['swf.unknown-linkage-name']);
    expect(diagnostics[0].detail).toEqual({ linkageName: 'absent' });
  });
});

describe('createScene2DFromSwf morph bounds', () => {
  it('reports the box the morph occupies at its ratio, not the union of both endpoints', () => {
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
    const place = (depth: number, ratio: number): Uint8Array =>
      createTag(
        TAG_PLACE_OBJECT_2,
        joinBytes(new Uint8Array([PLACE_HAS_CHARACTER | PLACE_HAS_RATIO]), uint16(depth), uint16(7), uint16(ratio)),
      );

    const document = createScene2DFromSwf(
      createSwf([
        createTag(TAG_DEFINE_MORPH_SHAPE, body),
        place(1, 0),
        place(2, 0x7fff),
        place(3, 0xffff),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    // The union would report 20 for all three. Each instance reports the box it is actually at, which is
    // what layout and hit testing read.
    const boxes = getNodeChildren(document!.root).map((node) => getNodeLocalBoundsRectangle(node).width);
    expect(boxes[0]).toBeCloseTo(10);
    expect(boxes[1]).toBeCloseTo(15, 1);
    expect(boxes[2]).toBeCloseTo(20);
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

describe('createScene2DImportFromSwf', () => {
  it('retains exact zero-copy JPEG3 and JPEG4 colour and alpha ranges on the full import report', () => {
    const jpeg3 = createJpegHeader(23, 17);
    const alpha3 = new Uint8Array([0x78, 0x01, 0x31, 0x32, 0x33]);
    const jpeg4 = createJpegHeader(31, 19);
    const alpha4 = new Uint8Array([0x78, 0x01, 0x41, 0x42, 0x43]);
    const deblockingParameterRaw = 0x81fe;
    const file = createSwf([
      createTag(TAG_DEFINE_BITS_JPEG_3, joinBytes(uint16(16), uint32(jpeg3.length), jpeg3, alpha3)),
      createTag(
        TAG_DEFINE_BITS_JPEG_4,
        joinBytes(uint16(17), uint32(jpeg4.length + 2), uint16(deblockingParameterRaw), jpeg4, alpha4),
      ),
      // Only JPEG3 is placed. JPEG4 still belongs on the full report, but not in document resources.
      createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(16))),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);

    const result = createScene2DImportFromSwf(file)!;

    expect(result.jpegAlphaPayloads).toHaveLength(2);
    const [jpeg3Payload, jpeg4Payload] = result.jpegAlphaPayloads;
    expect(jpeg3Payload).toMatchObject({
      characterId: 16,
      deblockingParameterRaw: null,
      height: 17,
      width: 23,
    });
    expect(jpeg4Payload).toMatchObject({
      characterId: 17,
      deblockingParameterRaw,
      height: 19,
      width: 31,
    });
    expect(jpeg3Payload.reference).toBe(result.document.imageResources[0]);
    expect(jpeg4Payload.reference.textures).toEqual([]);

    for (const [actual, expected] of [
      [jpeg3Payload.reference.bytes, jpeg3],
      [jpeg3Payload.compressedAlphaBytes, alpha3],
      [jpeg4Payload.reference.bytes, jpeg4],
      [jpeg4Payload.compressedAlphaBytes, alpha4],
    ] as const) {
      expect(actual).toEqual(expected);
      expect(actual.buffer).toBe(file.buffer);
      expect(actual.byteOffset).toBe(file.byteOffset + findBytes(file, expected));
    }
  });

  it('rejects JPEG alpha offsets outside the tag colour range', () => {
    const jpeg3 = createJpegHeader(23, 17);
    const jpeg4 = createJpegHeader(31, 19);
    const result = createScene2DImportFromSwf(
      createSwf([
        // JPEG3 points beyond the tag; JPEG4 points into its own two-byte deblocking field.
        createTag(TAG_DEFINE_BITS_JPEG_3, joinBytes(uint16(16), uint32(jpeg3.length + 1), jpeg3)),
        createTag(TAG_DEFINE_BITS_JPEG_4, joinBytes(uint16(17), uint32(1), uint16(0x1234), jpeg4)),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(1), uint16(16))),
        createTag(TAG_PLACE_OBJECT_2, joinBytes(new Uint8Array([PLACE_HAS_CHARACTER]), uint16(2), uint16(17))),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(result).not.toBeNull();
    expect(result!.jpegAlphaPayloads).toEqual([]);
    expect(result!.document.imageResources).toEqual([]);
  });

  it('keeps an advanced blend mode off the node and reports it for a BlendEffect instead', () => {
    const result = createScene2DImportFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_3,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER, PLACE3_HAS_BLEND_MODE]),
            uint16(3),
            uint16(7),
            swfString('overlaid'),
            new Uint8Array([SWF_BLEND_OVERLAY]),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const overlaid = result!.document.slots[0].target;
    // Assigning an advanced mode to the node would render as a silent Normal, which is the whole reason
    // the two tiers are separate.
    expect(overlaid.blendMode).toBe(BlendMode.Normal);
    expect(result!.appearances).toEqual([
      { advancedBlendMode: AdvancedBlendMode.Overlay, effects: [], frame: 1, node: overlaid },
    ]);
  });

  it('does not invent a trailing blend mode from an unknown filter payload', () => {
    const result = createScene2DImportFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_3,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER, PLACE3_HAS_FILTER_LIST | PLACE3_HAS_BLEND_MODE]),
            uint16(3),
            uint16(7),
            swfString('unknown-filter'),
            // Filter 0xfe is variable-width and unknown. Its first payload byte deliberately spells
            // Overlay; the real blend byte after it spells Multiply. Neither offset is safely reachable.
            new Uint8Array([1, 0xfe, SWF_BLEND_OVERLAY, SWF_BLEND_MULTIPLY]),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const node = result!.document.slots[0].target;
    expect(node.blendMode).toBe(BlendMode.Normal);
    expect(result!.appearances).toHaveLength(0);
  });

  it('reports a placement filter list as effect descriptors and attaches nothing', () => {
    const result = createScene2DImportFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_3,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER, PLACE3_HAS_FILTER_LIST]),
            uint16(3),
            uint16(7),
            swfString('blurred'),
            new Uint8Array([1, 1]),
            uint32(4 * FIXED_16_ONE),
            uint32(2 * FIXED_16_ONE),
            new Uint8Array([0]),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const blurred = result!.document.slots[0].target;
    expect(result!.appearances).toHaveLength(1);
    expect(result!.appearances[0]).toMatchObject({ advancedBlendMode: null, frame: 1, node: blurred });
    expect(result!.appearances[0].effects[0]).toMatchObject({ blurX: 4, blurY: 2, kind: 'BlurEffect' });
  });

  it('joins a colour-matrix filter onto the node adjustments, since a pointwise remap folds into the draw', () => {
    const cells: Uint8Array[] = [];
    for (let index = 0; index < 20; index++) cells.push(float32(index % 6 === 0 ? 1 : 0));
    const result = createScene2DImportFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_3,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER, PLACE3_HAS_FILTER_LIST]),
            uint16(3),
            uint16(7),
            swfString('remapped'),
            new Uint8Array([1, 6]),
            ...cells,
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const remapped = result!.document.slots[0].target;
    expect(result!.appearances).toHaveLength(0);
    expect(getNodeColorAdjustments(remapped)![0].kind).toBe('ColorMatrixAdjustment');
  });

  it('reports appearance per frame, so a filter list a later frame drops stops being reported', () => {
    const result = createScene2DImportFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_3,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_CHARACTER, PLACE3_HAS_FILTER_LIST]),
            uint16(3),
            uint16(7),
            swfString('fading'),
            new Uint8Array([1, 1]),
            uint32(FIXED_16_ONE),
            uint32(FIXED_16_ONE),
            new Uint8Array([0]),
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        // Frame 2 declares an empty list, which is a removal rather than silence.
        createTag(
          TAG_PLACE_OBJECT_3,
          joinBytes(new Uint8Array([PLACE_MOVE, PLACE3_HAS_FILTER_LIST]), uint16(3), new Uint8Array([0])),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    expect(result!.appearances.map((appearance) => appearance.frame)).toEqual([1]);
  });

  it('removes a declared colour-matrix filter without dropping the inherited colour transform', () => {
    const cells: Uint8Array[] = [];
    for (let index = 0; index < 20; index++) cells.push(float32(index % 6 === 0 ? 1 : 0));
    const result = createScene2DImportFromSwf(
      createSwf([
        createTag(
          TAG_PLACE_OBJECT_3,
          joinBytes(
            new Uint8Array([PLACE_HAS_NAME | PLACE_HAS_COLOR_TRANSFORM | PLACE_HAS_CHARACTER, PLACE3_HAS_FILTER_LIST]),
            uint16(3),
            uint16(7),
            createColorTransform([128, 256, 256, 256], [0, 0, 0, 0]),
            swfString('remapped'),
            new Uint8Array([1, 6]),
            ...cells,
          ),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(
          TAG_PLACE_OBJECT_3,
          joinBytes(new Uint8Array([PLACE_MOVE, PLACE3_HAS_FILTER_LIST]), uint16(3), new Uint8Array([0])),
        ),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    );

    const root = result!.document.root as MovieClip;
    const remapped = result!.document.slots[0].target;
    expect(getNodeColorAdjustments(remapped)).toHaveLength(2);
    gotoAndStopMovieClip(root, 2);
    expect(getNodeColorAdjustments(remapped)).toHaveLength(1);
    expect((getNodeColorAdjustments(remapped)![0] as ColorScaleBiasAdjustment).colorScaleBias.redScale).toBe(0.5);
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

  it('carries a lossless bitmap reference the symbol resource pass can resolve', async () => {
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
    const drawn = symbol!.root as Shape;
    expect(drawn.data.commands[0]).toBe('beginTextureFill');
    const texture = drawn.data.commands[2] as Texture2D;
    expect(getTextureSource(texture)).toBeNull();
    expect(symbol!.imageResources).toHaveLength(1);

    registerDeflateDecompressor();
    registerSwfImageDecoders();
    await loadScene2DImageResources(symbol!);

    expectLosslessTexturePixel(texture);
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

function expectLosslessTexturePixel(texture: Texture2D): void {
  const source = getTextureSource(texture);
  expect(source?.kind).toBe(BitmapTextureSourceKind);
  if (source?.kind !== BitmapTextureSourceKind) throw new Error('expected a lossless bitmap source');
  const bitmap = source as Bitmap;
  expect({
    alphaType: bitmap.alphaType,
    data: [...bitmap.data],
    gamut: bitmap.gamut,
    height: bitmap.height,
    kind: bitmap.kind,
    width: bitmap.width,
  }).toEqual({
    alphaType: 'opaque',
    data: [0x11, 0x22, 0x33, 0xff],
    gamut: 'srgb',
    height: 1,
    kind: BitmapTextureSourceKind,
    width: 1,
  });
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

// A colour transform in the format's own units: multiply terms are 8.8 fixed point (256 is 1.0) and add
// terms are signed byte offsets. Passing three channels writes the alpha-less form the legacy record uses.
function createColorTransform(multiply: ReadonlyArray<number>, add: ReadonlyArray<number>): Uint8Array {
  const writer = new BitWriter();
  const bits = signedBitCount([...multiply, ...add]);
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(bits, 4);
  for (const value of multiply) writer.writeSigned(value, bits);
  for (const value of add) writer.writeSigned(value, bits);
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

function findBytes(source: Uint8Array, expected: Uint8Array): number {
  for (let offset = 0; offset <= source.length - expected.length; offset++) {
    let matches = true;
    for (let index = 0; index < expected.length; index++) {
      if (source[offset + index] !== expected[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return offset;
  }
  throw new Error('Expected byte range was not found');
}

function signedBitCount(values: ReadonlyArray<number>): number {
  for (let bits = 1; bits < 32; bits++) {
    const minimum = -(2 ** (bits - 1));
    const maximum = 2 ** (bits - 1) - 1;
    if (values.every((value) => value >= minimum && value <= maximum)) return bits;
  }
  return 32;
}

function swfBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function swfString(value: string): Uint8Array {
  return joinBytes(_encoder.encode(value), new Uint8Array([0]));
}

// A minimal MP3 payload: one frame sync is all any of these tests reads back.
function mp3(): Uint8Array {
  return new Uint8Array([0xff, 0xfb, 0x90, 0x44]);
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function float32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0, value, true);
  return bytes;
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
const PLACE3_HAS_BLEND_MODE = 0x02;
const PLACE3_HAS_FILTER_LIST = 0x01;
const PLACE_HAS_CLIP_DEPTH = 0x40;
const PLACE_HAS_COLOR_TRANSFORM = 0x08;
const PLACE_HAS_MATRIX = 0x04;
const PLACE_HAS_NAME = 0x20;
const PLACE_MOVE = 0x01;
const SWF_BLEND_MULTIPLY = 3;
const SWF_BLEND_OVERLAY = 13;
const SWF_PREFIX_LENGTH = 8;
const TAG_END = 0;
const TAG_DEFINE_BITS_JPEG_2 = 21;
const TAG_DEFINE_BITS_JPEG_3 = 35;
const TAG_DEFINE_BITS_JPEG_4 = 90;
const TAG_DEFINE_BITS_LOSSLESS = 20;
const TAG_DEFINE_BITS_LOSSLESS_2 = 36;
const TAG_DEFINE_SOUND = 14;
const TAG_START_SOUND = 15;
const TAG_START_SOUND_2 = 89;
const TAG_DEFINE_SCALING_GRID = 78;
const TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA = 86;
const TAG_DEFINE_BITS = 6;
const TAG_DEFINE_BUTTON_2 = 34;
const TAG_DEFINE_EDIT_TEXT = 37;
const TAG_DEFINE_FONT = 10;
const TAG_DEFINE_MORPH_SHAPE_2 = 84;
const TAG_DEFINE_TEXT_2 = 33;
const TAG_DEFINE_FONT_2 = 48;
const TAG_DEFINE_FONT_3 = 75;
const TAG_DEFINE_FONT_INFO = 13;
const TAG_DEFINE_SHAPE = 2;
const TAG_DEFINE_SHAPE_2 = 22;
const TAG_DEFINE_SHAPE_3 = 32;
const TAG_DEFINE_SHAPE_4 = 83;
const TAG_DEFINE_SPRITE = 39;
const TAG_DEFINE_TEXT = 11;
const TAG_DEFINE_VIDEO_STREAM = 60;
const TAG_VIDEO_FRAME = 61;
const TAG_DO_ABC = 82;
const TAG_DO_ABC_ANONYMOUS = 72;
const TAG_DO_ACTION = 12;
const TAG_DO_INIT_ACTION = 59;
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
  const adler = testAdler32(bytes);
  return [
    0x78,
    0x01,
    0x01,
    length & 0xff,
    length >> 8,
    ~length & 0xff,
    (~length >> 8) & 0xff,
    ...bytes,
    adler >>> 24,
    (adler >>> 16) & 0xff,
    (adler >>> 8) & 0xff,
    adler & 0xff,
  ];
}

function testAdler32(bytes: readonly number[]): number {
  let first = 1;
  let second = 0;
  for (const byte of bytes) {
    first = (first + byte) % 65_521;
    second = (second + first) % 65_521;
  }
  return ((second << 16) | first) >>> 0;
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
