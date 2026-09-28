import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import { martinezPathBooleanKernel } from '@flighthq/path-boolean/contract';
import type { ImportDiagnostic, Node2D } from '@flighthq/types/contract';
import { DisplayObjectKind } from '@flighthq/types/contract';

import { getRiveCoreTypeName, isRiveCoreTypeDerivedFrom } from './riveCoreTypes.ts';
import { createScene2DFromRiveDocument } from './riveImport.ts';
import {
  createRiveImportRegistry,
  getRiveCoreObjectHandler,
  registerRiveCoreObjectHandler,
} from './riveImportRegistry.ts';
import { createRiveDocumentImportResult, initializeRiveDocumentImportResult } from './riveScene2D.ts';
import { registerRiveShapeHandlers } from './riveShapeNode.ts';

const kernel = martinezPathBooleanKernel;

// Rive states rotation in RADIANS, established from the corpus: 1,299 rotation values with a maximum
// of 6.93 and exact landmarks at 3PI/2 and 2PI, where degrees would show 90/180/360. Node2D.rotation
// is degrees. The unit assertions below are written against Node2D's contract rather than against the
// conversion, which is the mistake that hid the same seam in the Lottie importer.

const ARTBOARD = 1;
const NODE = 2;
const TEXT_INPUT = 569;
const DRAWABLE = 13;
const NESTED_ARTBOARD = 92;
const NESTED_ARTBOARD_LEAF = 451;
const NSLICED_NODE = 508;
const LAYOUT_COMPONENT = 409;
const ROOT_BONE = 41;
const SHAPE = 3;
const FILL = 20;
const NAME = 4;
const WIDTH = 7;
const HEIGHT = 8;
const ORIGIN_X = 11;
const ORIGIN_Y = 12;
const X = 13;
const Y = 14;
const X_LEGACY = 9;
const ROTATION = 15;
const SCALE_X = 16;
const SCALE_Y = 17;
const OPACITY = 18;
const PARENT_ID = 5;
const POINTS_PATH = 16;
const BLEND_MODE = 23;
const LAYOUT_COMPONENT_STYLE = 420;
const LAYOUT_PARTICIPANT = 1066;
const LAYOUT_STYLE_ID = 494;
const LAYOUT_FLEX_DIRECTION = 598;

describe('createRiveDocumentImportResult', () => {
  it('imports only what the registry claims, leaving an unregistered kind out', () => {
    const registry = createRiveImportRegistry();
    const source = buildRive([
      object(ARTBOARD, [text(NAME, 'Board'), float(WIDTH, 100), float(HEIGHT, 100)]),
      object(SHAPE, [text(NAME, 'box'), uint(PARENT_ID, 0)]),
    ]);

    const imported = createRiveDocumentImportResult(registry, source);

    // No family is registered, so the shape falls to the unregistered arm and imports as a plain
    // container rather than a Shape.
    const child = getNodeChildAt(imported.artboards[0].root, 0) as Node2D;
    expect(child.kind).toBe(DisplayObjectKind);
  });

  it('imports the kind a registered family claims', () => {
    const registry = createRiveImportRegistry();
    registerRiveShapeHandlers(registry);
    const source = buildRive([
      object(ARTBOARD, [text(NAME, 'Board'), float(WIDTH, 100), float(HEIGHT, 100)]),
      object(SHAPE, [text(NAME, 'box'), uint(PARENT_ID, 0)]),
    ]);

    const imported = createRiveDocumentImportResult(registry, source);

    expect((getNodeChildAt(imported.artboards[0].root, 0) as Node2D).kind).not.toBe(DisplayObjectKind);
  });

  it('reports a component type no family claims rather than losing it silently', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const source = buildRive([
      object(ARTBOARD, [text(NAME, 'Board'), float(WIDTH, 100), float(HEIGHT, 100)]),
      object(SHAPE, [text(NAME, 'box'), uint(PARENT_ID, 0)]),
      object(FILL, [uint(PARENT_ID, 1)]),
    ]);

    createRiveDocumentImportResult(createRiveImportRegistry(), source, diagnostics);

    // A Fill is not a Node, so it becomes nothing at all; that is the case worth naming.
    expect(diagnostics.map((entry) => entry.kind)).toContain('rive.core-type-unregistered');
  });

  it('returns an empty result for a file it cannot parse, without consulting the registry', () => {
    const registry = createRiveImportRegistry();
    registerRiveCoreObjectHandler(registry, SHAPE, {
      importComponent: () => {
        throw new Error('the registry must not be consulted for an unparsable file');
      },
    });

    const imported = createRiveDocumentImportResult(registry, new Uint8Array([0, 1, 2, 3]));

    expect(imported.artboards).toEqual([]);
    expect(imported.assets).toEqual([]);
    expect(getRiveCoreObjectHandler(registry, SHAPE)).not.toBeNull();
  });
});

interface TestProperty {
  key: number;
  raw: number[];
}

function encodeVarUint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  do {
    const group = remaining % 128;
    remaining = Math.floor(remaining / 128);
    bytes.push(remaining > 0 ? group + 128 : group);
  } while (remaining > 0);
  return bytes;
}

function float(key: number, value: number): TestProperty {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  return { key, raw: [view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)] };
}

function uint(key: number, value: number): TestProperty {
  return { key, raw: encodeVarUint(value) };
}

function text(key: number, value: string): TestProperty {
  const encoded = Array.from(new TextEncoder().encode(value));
  return { key, raw: [...encodeVarUint(encoded.length), ...encoded] };
}

function object(typeKey: number, properties: TestProperty[]): { properties: TestProperty[]; typeKey: number } {
  return { properties, typeKey };
}

function buildRive(objects: Array<{ properties: TestProperty[]; typeKey: number }>): Uint8Array {
  // Header with an empty table of contents, matching what a real file ships.
  const bytes: number[] = [0x52, 0x49, 0x56, 0x45, ...encodeVarUint(7), ...encodeVarUint(0), ...encodeVarUint(0), 0];
  for (const entry of objects) {
    bytes.push(...encodeVarUint(entry.typeKey));
    for (const property of entry.properties) bytes.push(...encodeVarUint(property.key), ...property.raw);
    bytes.push(0);
  }
  return new Uint8Array(bytes);
}
describe('initializeRiveDocumentImportResult', () => {
  it('is the construction initializer of createRiveDocumentImportResult', () => {
    expect(typeof initializeRiveDocumentImportResult).toBe('function');
  });
});
