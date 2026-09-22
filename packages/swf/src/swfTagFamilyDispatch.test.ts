import { sdkHostDecompressDeflate } from '@flighthq/compression/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
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
  createSwfTagFamilyRegistry,
  getSwfTagFamilies,
  getSwfTagFamilyDispatch,
  initializeSwfTagFamilyRegistry,
  SWF_TAG_FAMILY_INSTANTIATION_ORDER,
} from './swfTagFamilyDispatch';
import { createSwfDefaultTagFamilyRegistry } from './swfTagFamilyRegistry';
import {
  createSwfMatrixRecord,
  createSwfRectangleRecord,
  createSwfFileBytes,
  createSwfTagRecord,
  joinSwfBytes,
  SWF_PLACE_HAS_CHARACTER,
  SWF_PLACE_HAS_MATRIX,
  swfUint16Bytes,
} from './swfTagStreamTestHelper';

describe('createSwfTagFamilyDispatch', () => {
  it('expands every registered family into one flat table', () => {
    const registry = createSwfDefaultTagFamilyRegistry();
    const dispatch = getSwfTagFamilyDispatch(registry);
    let tags = 0;
    for (const slot of SWF_TAG_FAMILY_INSTANTIATION_ORDER) tags += registry[slot]!.tags.length;
    expect(dispatch.size).toBe(tags);
    expect(dispatch.get(TAG_DEFINE_SHAPE)).toBe(registry.shape);
    expect(dispatch.get(TAG_PLACE_OBJECT_2)).toBe(registry.placement);
  });

  it('contains nothing for a slot the caller left empty', () => {
    const dispatch = getSwfTagFamilyDispatch(createSwfTagFamilyRegistry({ shape: swfShapeTagFamily }));
    expect(dispatch.get(TAG_DEFINE_SHAPE)).toBe(swfShapeTagFamily);
    expect(dispatch.get(TAG_DO_ABC)).toBeUndefined();
    expect(dispatch.size).toBe(swfShapeTagFamily.tags.length);
  });

  it('treats an explicitly null slot as absent', () => {
    expect(getSwfTagFamilyDispatch(createSwfTagFamilyRegistry({ script: null, shape: swfShapeTagFamily })).size).toBe(
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
    const dispatch = getSwfTagFamilyDispatch(createSwfTagFamilyRegistry({ control: counted }));
    expect(reads).toBe(1);
    for (let i = 0; i < 1000; i++) dispatch.get(TAG_SET_BACKGROUND_COLOR);
    expect(reads).toBe(1);
  });
});

describe('createSwfTagFamilyRegistry', () => {
  it('keeps the families it was given and leaves the rest empty', () => {
    const registry = createSwfTagFamilyRegistry({ control: swfControlTagFamily, shape: swfShapeTagFamily });
    expect(registry.control).toBe(swfControlTagFamily);
    expect(registry.shape).toBe(swfShapeTagFamily);
    expect(registry.script).toBeNull();
    expect(registry.sound).toBeNull();
  });

  it('declares every slot, so an empty one reads as absent rather than as missing', () => {
    // A slot left undefined and a slot the type never had are indistinguishable at a property read, and
    // the difference is what tells a caller they misspelled a family from what they deliberately omitted.
    const registry = createSwfTagFamilyRegistry();
    for (const slot of SWF_TAG_FAMILY_INSTANTIATION_ORDER) {
      expect(slot in registry, slot).toBe(true);
      expect(registry[slot], slot).toBeNull();
    }
  });

  it('expands the flat table when the registry is built, not when it is first used', () => {
    const registry = createSwfTagFamilyRegistry({ shape: swfShapeTagFamily });
    expect(registry.dispatch.size).toBe(swfShapeTagFamily.tags.length);
    // The same object every time: nothing re-expands per import, so per-tag cost cannot grow with reuse.
    expect(getSwfTagFamilyDispatch(registry)).toBe(registry.dispatch);
  });
});

describe('dispatch cost', () => {
  // The design claim the flat table exists to make: per-tag cost does not grow with how many families
  // were registered. A registry-order scan would make a document's parse time depend on the caller's
  // registry rather than on the document, and the regression is invisible on the small fixtures the rest
  // of the suite uses — which is why this one is deliberately large.
  //
  // Asserted as a RATIO between two registries over the same document, not as a wall-clock budget: an
  // absolute threshold is a claim about this machine, and would be flaky on a loaded one. A scan over ten
  // slots instead of one lookup would show up here as a multiple, not as a few percent.
  it('parses one document at the same cost under a one-family and a ten-family registry', () => {
    const document = manyTagDocument(TAG_COUNT);
    const lean = createSwfTagFamilyRegistry({ control: swfControlTagFamily });
    const full = createSwfDefaultTagFamilyRegistry();

    // A timing test that silently walked an empty document would report a fast, plausible number, so the
    // document is read once for its LAST tag's colour before either measurement: nothing else in the file
    // produces that value, and producing it means every tag before it was dispatched.
    expect(createScene2DFromSwf(document, lean, DEFLATE, null)!.backgroundColor).toBe(LAST_BACKGROUND_COLOR);
    expect(createScene2DFromSwf(document, full, DEFLATE, null)!.backgroundColor).toBe(LAST_BACKGROUND_COLOR);

    // Both registries claim TAG_SET_BACKGROUND_COLOR, so both take the same branch for every tag; only
    // the size of the table they look it up in differs.
    const leanMilliseconds = timeImport(document, lean);
    const fullMilliseconds = timeImport(document, full);
    const baseline = Math.max(leanMilliseconds, 1);
    expect(fullMilliseconds / baseline).toBeLessThan(3);
  });

  // The table is built once per import, so its construction cost cannot ride on the tag count either.
  it('builds the table in one pass over the registered families', () => {
    const registry = createSwfDefaultTagFamilyRegistry();
    const dispatch = getSwfTagFamilyDispatch(registry);
    let claimed = 0;
    for (const family of getSwfTagFamilies(registry)) claimed += family.tags.length;
    // One entry per claimed tag and not one more: a table built by scanning would still be correct, but
    // a table built twice, or built per tag, would not have exactly this size.
    expect(dispatch.size).toBe(claimed);
  });
});

describe('getSwfTagFamilies', () => {
  it('returns the registered families in the order the registry declares', () => {
    const families = getSwfTagFamilies(
      createSwfTagFamilyRegistry({ shape: swfShapeTagFamily, control: swfControlTagFamily }),
    );
    // shape precedes control in SWF_TAG_FAMILY_INSTANTIATION_ORDER regardless of object literal order.
    expect(families).toEqual([swfShapeTagFamily, swfControlTagFamily]);
  });

  it('returns nothing for an empty registry', () => {
    expect(getSwfTagFamilies(createSwfTagFamilyRegistry({}))).toEqual([]);
  });
});

describe('getSwfTagFamilyDispatch', () => {
  it('returns the table the registry was expanded into', () => {
    const registry = createSwfDefaultTagFamilyRegistry();
    expect(getSwfTagFamilyDispatch(registry)).toBe(registry.dispatch);
  });
});

describe('initializeSwfTagFamilyRegistry', () => {
  it('is the construction initializer createSwfTagFamilyRegistry composes', () => {
    const out = allocateEntity<SwfTagFamilyRegistry>();
    initializeSwfTagFamilyRegistry(out, { placement: swfPlacementTagFamily });
    const registry = finishEntity(out);
    expect(registry.placement).toBe(swfPlacementTagFamily);
    expect(registry.dispatch.size).toBe(swfPlacementTagFamily.tags.length);
  });
});

function scriptedDocument(): Uint8Array {
  // A DoAction whose whole body is one `stop` (0x07), which the importer recognizes as a frame script.
  return createSwfFileBytes([
    createSwfTagRecord(TAG_DO_ACTION, new Uint8Array([0x07, 0x00])),
    createSwfTagRecord(TAG_SHOW_FRAME),
    createSwfTagRecord(TAG_END),
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
  return createSwfFileBytes([
    createSwfTagRecord(
      TAG_DEFINE_SHAPE,
      joinSwfBytes(swfUint16Bytes(7), createSwfRectangleRecord(0, 400, 0, 400), shape.toBytes()),
    ),
    createSwfTagRecord(
      TAG_PLACE_OBJECT_2,
      joinSwfBytes(
        new Uint8Array([SWF_PLACE_HAS_MATRIX | SWF_PLACE_HAS_CHARACTER]),
        swfUint16Bytes(1),
        swfUint16Bytes(7),
        createSwfMatrixRecord(1, 0, 0, 1, 0, 0),
      ),
    ),
    createSwfTagRecord(TAG_SHOW_FRAME),
    createSwfTagRecord(TAG_END),
  ]);
}

const DEFLATE = sdkHostDecompressDeflate;
// Everything needed to place artwork, and nothing else: the registry the tree-shaking fixture builds too.
const ARTWORK_FAMILIES = createSwfTagFamilyRegistry({
  control: swfControlTagFamily,
  placement: swfPlacementTagFamily,
  shape: swfShapeTagFamily,
  sprite: swfSpriteTagFamily,
});
const TAG_DEFINE_SHAPE = 2;
const TAG_DEFINE_SPRITE = 39;
const TAG_DO_ABC = 82;
const TAG_DO_ACTION = 12;
const TAG_END = 0;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_SET_BACKGROUND_COLOR = 9;
const TAG_SHOW_FRAME = 1;

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
    const swf = createSwfFileBytes([
      createSwfTagRecord(TAG_DO_ABC, opaque),
      createSwfTagRecord(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0x11, 0x22, 0x33])),
      createSwfTagRecord(TAG_SHOW_FRAME),
      createSwfTagRecord(TAG_END),
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
      createSwfTagFamilyRegistry({ control: swfControlTagFamily, placement: swfPlacementTagFamily }),
      DEFLATE,
      null,
    );
    expect(without).not.toBeNull();
    expect(getNodeChildren(without!.root)).toHaveLength(0);
  });

  it('walks a nested sprite body with the same registry as the root', () => {
    const swf = createSwfFileBytes([
      createSwfTagRecord(
        TAG_DEFINE_SPRITE,
        joinSwfBytes(
          swfUint16Bytes(10),
          swfUint16Bytes(1),
          createSwfTagRecord(TAG_DO_ACTION, new Uint8Array([0x07, 0x00])),
          createSwfTagRecord(TAG_END),
        ),
      ),
      createSwfTagRecord(TAG_SHOW_FRAME),
      createSwfTagRecord(TAG_END),
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

// A stream of one tag repeated, so the measurement is of dispatch rather than of any one parser. The
// last tag's red channel counts the stream, which is what makes the walk checkable from the result.
function manyTagDocument(tagCount: number): Uint8Array {
  const tags: Uint8Array[] = [];
  for (let i = 0; i < tagCount; i++) {
    tags.push(createSwfTagRecord(TAG_SET_BACKGROUND_COLOR, new Uint8Array([i & 0xff, 0x22, 0x33])));
  }
  tags.push(createSwfTagRecord(TAG_SHOW_FRAME), createSwfTagRecord(TAG_END));
  return createSwfFileBytes(tags);
}

function timeImport(document: Uint8Array, registry: SwfTagFamilyRegistry): number {
  // One warm run so neither measurement pays for first-call compilation.
  createScene2DFromSwf(document, registry, DEFLATE, null);
  const started = performance.now();
  for (let run = 0; run < 3; run++) createScene2DFromSwf(document, registry, DEFLATE, null);
  return performance.now() - started;
}

const TAG_COUNT = 20_000;
// Last declaration wins, so the document's colour is the final tag's: red counts the stream, and the
// remaining channels and full opacity are what the reader packs around it.
const LAST_BACKGROUND_COLOR = (((TAG_COUNT - 1) & 0xff) << 24) + 0x2233ff;
