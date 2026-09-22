import { sdkHostDecompressDeflate } from '@flighthq/compression/contract';
import { collectImportDiagnostics } from '@flighthq/importdiagnostics/contract';
import { getMovieClipFrameScript, getMovieClipTotalFrames } from '@flighthq/movieclip/contract';
import { getNodeChildren } from '@flighthq/node/contract';
import type { MovieClip, SwfTagFamily, SwfTagFamilyRegistry } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, MovieClipKind } from '@flighthq/types/contract';

import { swfControlTagFamily } from './swfControlTagFamily';
import { createScene2DFromSwf, createScene2DImportFromSwf } from './swfDocument';
import { swfPlacementTagFamily } from './swfPlacementTagFamily';
import { swfShapeTagFamily } from './swfShapeTagFamily';
import { ShapeWriter } from './swfShapeTestHelper';
import { swfSpriteTagFamily } from './swfSpriteTagFamily';
import {
  createSwfDefaultTagFamilyRegistry,
  createSwfTagFamilyDispatch,
  getSwfTagFamilies,
  SWF_TAG_FAMILY_INSTANTIATION_ORDER,
} from './swfTagFamilyRegistry';
import {
  createMatrix,
  createRectangle,
  createSwf,
  createTag,
  joinBytes,
  PLACE_HAS_CHARACTER,
  PLACE_HAS_MATRIX,
  uint16,
} from './swfTagStreamTestHelper';

describe('createSwfDefaultTagFamilyRegistry', () => {
  it('fills every slot the registry declares', () => {
    const registry = createSwfDefaultTagFamilyRegistry();
    // Read off the slot list rather than a hand-written one, so a new family cannot be added to the type
    // and silently left out of the factory that is supposed to name them all.
    for (const slot of SWF_TAG_FAMILY_INSTANTIATION_ORDER) {
      expect(registry[slot], slot).toBeDefined();
    }
    expect(getSwfTagFamilies(registry)).toHaveLength(SWF_TAG_FAMILY_INSTANTIATION_ORDER.length);
  });

  it('gives every family a disjoint tag range', () => {
    // Two families claiming one code would make the flat table's contents depend on slot order, so the
    // build a caller assembled would not be the build they described.
    const claimed = new Map<number, string>();
    const registry = createSwfDefaultTagFamilyRegistry();
    for (const slot of SWF_TAG_FAMILY_INSTANTIATION_ORDER) {
      for (const tag of registry[slot]!.tags) {
        expect(claimed.get(tag), `tag ${tag} also claimed by ${claimed.get(tag)}`).toBeUndefined();
        claimed.set(tag, slot);
      }
    }
    expect(claimed.size).toBeGreaterThan(40);
  });

  it('imports a document the same way the whole registry does when nothing is left out', () => {
    const swf = shapeDocument();
    expect(createScene2DFromSwf(swf, createSwfDefaultTagFamilyRegistry(), DEFLATE, null)).not.toBeNull();
  });
});

describe('createSwfTagFamilyDispatch', () => {
  it('expands every registered family into one flat table', () => {
    const registry = createSwfDefaultTagFamilyRegistry();
    const dispatch = createSwfTagFamilyDispatch(registry);
    let tags = 0;
    for (const slot of SWF_TAG_FAMILY_INSTANTIATION_ORDER) tags += registry[slot]!.tags.length;
    expect(dispatch.size).toBe(tags);
    expect(dispatch.get(TAG_DEFINE_SHAPE)).toBe(registry.shape);
    expect(dispatch.get(TAG_PLACE_OBJECT_2)).toBe(registry.placement);
  });

  it('contains nothing for a slot the caller left empty', () => {
    const dispatch = createSwfTagFamilyDispatch({ shape: swfShapeTagFamily });
    expect(dispatch.get(TAG_DEFINE_SHAPE)).toBe(swfShapeTagFamily);
    expect(dispatch.get(TAG_DO_ABC)).toBeUndefined();
    expect(dispatch.size).toBe(swfShapeTagFamily.tags.length);
  });

  it('treats an explicitly null slot as absent', () => {
    expect(createSwfTagFamilyDispatch({ script: null, shape: swfShapeTagFamily }).size).toBe(
      swfShapeTagFamily.tags.length,
    );
  });

  // The per-tag cost has to stay one lookup: a registry-order scan would make a document's parse time
  // depend on how many families the caller registered.
  it('builds the table once, and looks a tag up without consulting the families again', () => {
    let reads = 0;
    const counted: SwfTagFamily = {
      get tags() {
        reads++;
        return swfControlTagFamily.tags;
      },
      parse: swfControlTagFamily.parse,
    };
    const dispatch = createSwfTagFamilyDispatch({ control: counted });
    expect(reads).toBe(1);
    for (let i = 0; i < 1000; i++) dispatch.get(TAG_SET_BACKGROUND_COLOR);
    expect(reads).toBe(1);
  });
});

describe('getSwfTagFamilies', () => {
  it('returns the registered families in the order the registry declares', () => {
    const families = getSwfTagFamilies({ shape: swfShapeTagFamily, control: swfControlTagFamily });
    // shape precedes control in SWF_TAG_FAMILY_INSTANTIATION_ORDER regardless of object literal order.
    expect(families).toEqual([swfShapeTagFamily, swfControlTagFamily]);
  });

  it('returns nothing for an empty registry', () => {
    expect(getSwfTagFamilies({})).toEqual([]);
  });
});

describe('selective registries', () => {
  // The headline claim: a document carrying script tags parses without the script family, reports the
  // tags it skipped, and comes back with no scripts rather than failing.
  it('imports a scripted document with the script family omitted, and carries no scripts', () => {
    const swf = scriptedDocument();

    const withScripts = createScene2DFromSwf(swf, createSwfDefaultTagFamilyRegistry(), DEFLATE, null)!;
    expect(getMovieClipFrameScript(withScripts.root as MovieClip, 1)).not.toBeNull();

    const diagnostics = collectImportDiagnostics((sink) => {
      const without = createScene2DFromSwf(swf, ARTWORK_FAMILIES, DEFLATE, null, sink);
      expect(without).not.toBeNull();
      expect(without!.root.kind).toBe(MovieClipKind);
      expect(getMovieClipTotalFrames(without!.root as MovieClip)).toBe(
        getMovieClipTotalFrames(withScripts.root as MovieClip),
      );
      expect(getMovieClipFrameScript(without!.root as MovieClip, 1)).toBeNull();
    });

    expect(diagnostics.map((entry) => entry.kind)).toEqual(['swf.tag-handler-unregistered']);
    expect(diagnostics[0]).toMatchObject({
      detail: { tag: TAG_DO_ACTION },
      severity: ImportDiagnosticSeverity.Skip,
    });
  });

  // A skipped tag has to be skipped by its length prefix, or every record after it is misread. The
  // document below puts a long unregistered body between two registered ones.
  it('advances past an unregistered body by its length prefix', () => {
    const opaque = new Uint8Array(200).fill(0xff);
    const swf = createSwf([
      createTag(TAG_DO_ABC, opaque),
      createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0x11, 0x22, 0x33])),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const document = createScene2DFromSwf(swf, ARTWORK_FAMILIES, DEFLATE, null);
    expect(document).not.toBeNull();
    // The background colour is the tag AFTER the skipped one: reading it proves the stream stayed aligned.
    expect(document!.backgroundColor).toBe(0x112233ff);
  });

  it('omits a character whose defining family is absent, without failing the document', () => {
    // The sprite places a shape; with the shape family omitted the placement has nothing to become.
    const swf = shapeDocument();
    const withShapes = createScene2DFromSwf(swf, createSwfDefaultTagFamilyRegistry(), DEFLATE, null)!;
    expect(getNodeChildren(withShapes.root)).toHaveLength(1);

    const without = createScene2DFromSwf(
      swf,
      { control: swfControlTagFamily, placement: swfPlacementTagFamily },
      DEFLATE,
      null,
    );
    expect(without).not.toBeNull();
    expect(getNodeChildren(without!.root)).toHaveLength(0);
  });

  it('walks a nested sprite body with the same registry as the root', () => {
    const swf = createSwf([
      createTag(
        TAG_DEFINE_SPRITE,
        joinBytes(uint16(10), uint16(1), createTag(TAG_DO_ACTION, new Uint8Array([0x07, 0x00])), createTag(TAG_END)),
      ),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createScene2DFromSwf(swf, ARTWORK_FAMILIES, DEFLATE, null, sink)).not.toBeNull();
    });
    // The DoAction inside the sprite is reported exactly as one at the root would be, which is only true
    // if the nested walk used the caller's registry rather than a default of its own.
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['swf.tag-handler-unregistered']);
    expect(diagnostics[0]!.detail).toMatchObject({ tag: TAG_DO_ACTION });
  });

  it('builds no resources for a family the registry omits', () => {
    const swf = shapeDocument();
    const full = createScene2DImportFromSwf(swf, createSwfDefaultTagFamilyRegistry(), DEFLATE, null)!;
    const lean = createScene2DImportFromSwf(swf, ARTWORK_FAMILIES, DEFLATE, null)!;
    expect(full.document.audioResources).toEqual([]);
    expect(lean.document.imageResources).toEqual([]);
    expect(lean.document.audioResources).toEqual([]);
    expect(lean.jpegAlphaPayloads).toEqual([]);
  });
});

function scriptedDocument(): Uint8Array {
  // A DoAction whose whole body is one `stop` (0x07), which the importer recognizes as a frame script.
  return createSwf([
    createTag(TAG_DO_ACTION, new Uint8Array([0x07, 0x00])),
    createTag(TAG_SHOW_FRAME),
    createTag(TAG_END),
  ]);
}

// One solid rectangle, defined and placed: the smallest document that produces a drawable node, which is
// what makes "the node is gone when the shape family is" a claim about the family rather than about a
// fixture that never drew anything.
function shapeDocument(): Uint8Array {
  const shape = new ShapeWriter();
  shape.writeSolidFillStyles([0x3366cc]);
  shape.writeLineStyleCount(0);
  shape.writeStyleBits(1, 0);
  shape.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
  shape.writeStraightEdge(400, 0);
  shape.writeStraightEdge(0, 400);
  shape.writeStraightEdge(-400, 0);
  shape.writeStraightEdge(0, -400);
  shape.writeEndShape();
  return createSwf([
    createTag(TAG_DEFINE_SHAPE, joinBytes(uint16(7), createRectangle(0, 400, 0, 400), shape.toBytes())),
    createTag(
      TAG_PLACE_OBJECT_2,
      joinBytes(
        new Uint8Array([PLACE_HAS_MATRIX | PLACE_HAS_CHARACTER]),
        uint16(1),
        uint16(7),
        createMatrix(1, 0, 0, 1, 0, 0),
      ),
    ),
    createTag(TAG_SHOW_FRAME),
    createTag(TAG_END),
  ]);
}

const DEFLATE = sdkHostDecompressDeflate;
// Everything needed to place artwork, and nothing else: the registry the tree-shaking fixture builds too.
const ARTWORK_FAMILIES: SwfTagFamilyRegistry = {
  control: swfControlTagFamily,
  placement: swfPlacementTagFamily,
  shape: swfShapeTagFamily,
  sprite: swfSpriteTagFamily,
};
const TAG_DEFINE_SHAPE = 2;
const TAG_DEFINE_SPRITE = 39;
const TAG_DO_ABC = 82;
const TAG_DO_ACTION = 12;
const TAG_END = 0;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_SET_BACKGROUND_COLOR = 9;
const TAG_SHOW_FRAME = 1;
