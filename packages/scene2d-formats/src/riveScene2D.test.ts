import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type { Node2D } from '@flighthq/types/contract';

import { createScene2DFromRiveDocument } from './riveScene2D';

// Rive states rotation in RADIANS, established from the corpus: 1,299 rotation values with a maximum
// of 6.93 and exact landmarks at 3PI/2 and 2PI, where degrees would show 90/180/360. Node2D.rotation
// is degrees. The unit assertions below are written against Node2D's contract rather than against the
// conversion, which is the mistake that hid the same seam in the Lottie importer.

const ARTBOARD = 1;
const NODE = 2;
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

describe('createScene2DFromRiveDocument', () => {
  it('returns no artboards for bytes that are not a Rive file', () => {
    expect(createScene2DFromRiveDocument(new Uint8Array([1, 2, 3, 4])).artboards).toEqual([]);
  });

  it('imports each artboard with its name and size', () => {
    const result = createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [text(NAME, 'First'), float(WIDTH, 400), float(HEIGHT, 300)]),
        object(ARTBOARD, [text(NAME, 'Second'), float(WIDTH, 120), float(HEIGHT, 60)]),
      ]),
    );

    expect(result.artboards.map((artboard) => [artboard.name, artboard.width, artboard.height])).toEqual([
      ['First', 400, 300],
      ['Second', 120, 60],
    ]);
    expect(result.artboards[0].root.name).toBe('First');
  });

  it('converts the artboard origin into a pivot in artboard units', () => {
    const result = createScene2DFromRiveDocument(
      buildRive([object(ARTBOARD, [float(WIDTH, 400), float(HEIGHT, 300), float(ORIGIN_X, 0.5), float(ORIGIN_Y, 1)])]),
    );

    expect(result.artboards[0].root.pivotX).toBe(200);
    expect(result.artboards[0].root.pivotY).toBe(300);
  });

  it('writes rotation in the degrees Node2D expects, from the radians Rive states', () => {
    const result = createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [float(WIDTH, 100), float(HEIGHT, 100)]),
        object(NODE, [uint(PARENT_ID, 0), float(ROTATION, Math.PI / 2)]),
        object(NODE, [uint(PARENT_ID, 0), float(ROTATION, Math.PI)]),
      ]),
    );
    const root = result.artboards[0].root;

    // Tolerance is float32's, not slack: the file stores PI/2 in four bytes, so the exact conversion
    // of the stored value is 90.0000025. Demanding more would be asserting a precision the wire does
    // not carry.
    expect((getNodeChildAt(root, 0) as Node2D).rotation).toBeCloseTo(90, 4);
    expect((getNodeChildAt(root, 1) as Node2D).rotation).toBeCloseTo(180, 4);
  });

  it('applies the format defaults for properties the file omits', () => {
    // A Rive file writes only what differs from the documented initial value, so an absent scale
    // means 1 and an absent opacity means 1 — not zero.
    const result = createScene2DFromRiveDocument(
      buildRive([object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]), object(NODE, [uint(PARENT_ID, 0)])]),
    );
    const node = getNodeChildAt(result.artboards[0].root, 0) as Node2D;

    expect(node).toMatchObject({ alpha: 1, rotation: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 });
  });

  it('reads the transform a node states', () => {
    const result = createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]),
        object(NODE, [
          uint(PARENT_ID, 0),
          text(NAME, 'moved'),
          float(X, 12),
          float(Y, -7),
          float(SCALE_X, 2),
          float(SCALE_Y, 0.5),
          float(OPACITY, 0.25),
        ]),
      ]),
    );
    const node = getNodeChildAt(result.artboards[0].root, 0) as Node2D;

    expect(node).toMatchObject({ alpha: 0.25, name: 'moved', scaleX: 2, scaleY: 0.5, x: 12, y: -7 });
  });

  it('accepts the retired position key files still write', () => {
    const result = createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]),
        object(NODE, [uint(PARENT_ID, 0), float(X_LEGACY, 33)]),
      ]),
    );

    expect((getNodeChildAt(result.artboards[0].root, 0) as Node2D).x).toBe(33);
  });

  it('nests nodes the way the component tree states', () => {
    const result = createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]),
        object(NODE, [uint(PARENT_ID, 0), text(NAME, 'parent')]),
        object(NODE, [uint(PARENT_ID, 1), text(NAME, 'child')]),
      ]),
    );
    const root = result.artboards[0].root;
    const parent = getNodeChildAt(root, 0) as Node2D;

    expect(getNodeChildCount(root)).toBe(1);
    expect(parent.name).toBe('parent');
    expect((getNodeChildAt(parent, 0) as Node2D).name).toBe('child');
  });

  // A Fill is a component and gets an index, but it is paint belonging to its shape rather than a
  // node. Emitting one would put a phantom object in the display tree.
  it('makes display objects only for components that are nodes', () => {
    const result = createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]),
        object(SHAPE, [uint(PARENT_ID, 0), text(NAME, 'shape')]),
        object(FILL, [uint(PARENT_ID, 1)]),
      ]),
    );
    const root = result.artboards[0].root;

    expect(getNodeChildCount(root)).toBe(1);
    expect(getNodeChildCount(getNodeChildAt(root, 0) as Node2D)).toBe(0);
  });

  it('reparents past a non-node ancestor rather than dropping its descendants', () => {
    const result = createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]),
        object(FILL, [uint(PARENT_ID, 0)]),
        object(NODE, [uint(PARENT_ID, 1), text(NAME, 'orphaned')]),
      ]),
    );
    const root = result.artboards[0].root;

    expect(getNodeChildCount(root)).toBe(1);
    expect((getNodeChildAt(root, 0) as Node2D).name).toBe('orphaned');
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
