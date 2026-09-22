import { sdkHostDecompressDeflate } from '@flighthq/compression/contract';

import { createScene2DFromSwf } from './swfDocument';
import { ShapeWriter } from './swfShapeTestHelper';
import { SWF_TAG_FAMILY_INSTANTIATION_ORDER, getSwfTagFamilies } from './swfTagFamilyDispatch';
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
    const swf = createSwfFileBytes([
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
    expect(
      createScene2DFromSwf(swf, createSwfDefaultTagFamilyRegistry(), sdkHostDecompressDeflate, null),
    ).not.toBeNull();
  });
});

const TAG_DEFINE_SHAPE = 2;
const TAG_END = 0;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_SHOW_FRAME = 1;
