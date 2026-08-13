import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type { ImportDiagnostic, Node2D } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { createScene2DFromRiveDocument } from './riveScene2D';

// A Solo shows exactly one of its children at a time. Imported as a plain node it would draw all of
// its variants stacked, so the active child is resolved at import and the rest are hidden.

const ARTBOARD = 1;
const SHAPE = 3;
const SOLO = 147;

const NAME = 4;
const PARENT_ID = 5;
const WIDTH = 7;
const HEIGHT = 8;
const ACTIVE_COMPONENT_ID = 296;

describe('applyRiveSolo', () => {
  it('shows only the child the solo names active', () => {
    // Solo is index 1; its children are 2 and 3, with 3 active.
    const solo = firstChild(
      build([
        object(SOLO, [text(NAME, 'variants'), uint(PARENT_ID, 0), uint(ACTIVE_COMPONENT_ID, 3)]),
        shape('a', 1),
        shape('b', 1),
      ]),
    );

    expect(visibility(solo)).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('leaves a node that is not a solo entirely visible', () => {
    const root = build([shape('a', 0), shape('b', 0)]);

    expect(visibility(root)).toEqual([
      ['a', true],
      ['b', true],
    ]);
  });

  it('hides nothing outside the solo, so a sibling subtree is untouched', () => {
    const root = build([
      object(SOLO, [text(NAME, 'variants'), uint(PARENT_ID, 0), uint(ACTIVE_COMPONENT_ID, 2)]),
      shape('a', 1),
      shape('outside', 0),
    ]);

    expect(visibility(root)).toEqual([
      ['variants', true],
      ['outside', true],
    ]);
  });

  it('reports a solo whose active child does not resolve rather than hiding every variant', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const solo = firstChild(
      build(
        [object(SOLO, [text(NAME, 'variants'), uint(PARENT_ID, 0), uint(ACTIVE_COMPONENT_ID, 99)]), shape('a', 1)],
        diagnostics,
      ),
    );

    expect(diagnostics.map((entry) => entry.kind)).toEqual(['rive.solo-unresolved-active']);
    // Drop, not Skip: the feature is supported and the DATA failed, so this is lost data rather than a
    // capability gap. Pinned because a Skip here would exempt itself from every severity-based check.
    expect(diagnostics[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(visibility(solo)).toEqual([['a', true]]);
  });

  it('reports an active index that is not the solo own child', () => {
    const diagnostics: ImportDiagnostic[] = [];
    // Index 2 is parented to the artboard, not to the solo.
    build(
      [object(SOLO, [text(NAME, 'variants'), uint(PARENT_ID, 0), uint(ACTIVE_COMPONENT_ID, 2)]), shape('other', 0)],
      diagnostics,
    );

    expect(diagnostics.map((entry) => entry.kind)).toEqual(['rive.solo-unresolved-active']);
  });
});

function firstChild(root: Node2D): Node2D {
  return getNodeChildAt(root, 0) as Node2D;
}

function visibility(node: Node2D): Array<[string, boolean]> {
  const out: Array<[string, boolean]> = [];
  for (let index = 0; index < getNodeChildCount(node); index++) {
    const child = getNodeChildAt(node, index) as Node2D;
    out.push([child.name ?? '', child.visible]);
  }
  return out;
}

function build(objects: TestObject[], diagnostics?: ImportDiagnostic[]): Node2D {
  const artboard = object(ARTBOARD, [text(NAME, 'Board'), float(WIDTH, 100), float(HEIGHT, 100)]);
  return createScene2DFromRiveDocument(encodeRive([artboard, ...objects]), diagnostics).artboards[0].root;
}

interface TestProperty {
  key: number;
  raw: number[];
}

interface TestObject {
  properties: TestProperty[];
  typeKey: number;
}

function encodeVarUint(value: number): number[] {
  const out: number[] = [];
  let remaining = value;
  do {
    const group = remaining % 128;
    remaining = Math.floor(remaining / 128);
    out.push(remaining > 0 ? group + 128 : group);
  } while (remaining > 0);
  return out;
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

function object(typeKey: number, properties: TestProperty[]): TestObject {
  return { properties, typeKey };
}

function shape(name: string, parentIndex: number): TestObject {
  return object(SHAPE, [text(NAME, name), uint(PARENT_ID, parentIndex)]);
}

function encodeRive(objects: TestObject[]): Uint8Array {
  const out: number[] = [0x52, 0x49, 0x56, 0x45, ...encodeVarUint(7), ...encodeVarUint(0), ...encodeVarUint(0), 0];
  for (const entry of objects) {
    out.push(...encodeVarUint(entry.typeKey));
    for (const property of entry.properties) out.push(...encodeVarUint(property.key), ...property.raw);
    out.push(0);
  }
  return new Uint8Array(out);
}
