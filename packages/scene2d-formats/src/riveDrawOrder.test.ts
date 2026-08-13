import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type { ImportDiagnostic, Node2D } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { createScene2DFromRiveDocument } from './riveScene2D';

// A DrawRules is parented to the node it governs and names a DrawTarget, which names the drawable to
// sit beside and whether to land before or after it. Ordering permutes within one parent, so a rule
// whose two ends are not siblings is reported rather than approximated by reparenting.

const ARTBOARD = 1;
const NODE = 2;
const SHAPE = 3;
const DRAW_TARGET = 48;
const DRAW_RULES = 49;

const NAME = 4;
const PARENT_ID = 5;
const WIDTH = 7;
const HEIGHT = 8;
const DRAWABLE_ID = 119;
const PLACEMENT_VALUE = 120;
const DRAW_TARGET_ID = 121;

describe('applyRiveDrawOrder', () => {
  it('leaves hierarchy order alone when the artboard states no rule', () => {
    expect(childNames(build([shape('a', 0), shape('b', 0)]))).toEqual(['a', 'b']);
  });

  it('draws a governed sibling above its target, reversing hierarchy order', () => {
    // 'a' is governed and placed after 'b', so it ends up last.
    const names = childNames(
      build([
        shape('a', 0),
        shape('b', 0),
        object(DRAW_TARGET, [uint(PARENT_ID, 0), uint(DRAWABLE_ID, 2), uint(PLACEMENT_VALUE, 1)]),
        object(DRAW_RULES, [uint(PARENT_ID, 1), uint(DRAW_TARGET_ID, 3)]),
      ]),
    );

    expect(names).toEqual(['b', 'a']);
  });

  it('draws a governed sibling below its target', () => {
    const names = childNames(
      build([
        shape('a', 0),
        shape('b', 0),
        object(DRAW_TARGET, [uint(PARENT_ID, 0), uint(DRAWABLE_ID, 1), uint(PLACEMENT_VALUE, 0)]),
        object(DRAW_RULES, [uint(PARENT_ID, 2), uint(DRAW_TARGET_ID, 3)]),
      ]),
    );

    expect(names).toEqual(['b', 'a']);
  });

  it('reports a rule whose ends are not siblings instead of reparenting the governed node', () => {
    const diagnostics: ImportDiagnostic[] = [];
    // 'b' sits under the group, so it and 'a' are not siblings.
    const root = build(
      [
        shape('a', 0),
        object(NODE, [text(NAME, 'group'), uint(PARENT_ID, 0)]),
        shape('b', 2),
        object(DRAW_TARGET, [uint(PARENT_ID, 0), uint(DRAWABLE_ID, 1)]),
        object(DRAW_RULES, [uint(PARENT_ID, 3), uint(DRAW_TARGET_ID, 4)]),
      ],
      diagnostics,
    );

    expect(diagnostics.map((entry) => entry.kind)).toEqual(['rive.draw-rule-crosses-parent']);
    // The governed node stays inside the group whose alpha, blend, and clip it composites under.
    expect(childNames(root)).toEqual(['a', 'group']);
  });

  it('reports a rule whose target does not resolve', () => {
    const diagnostics: ImportDiagnostic[] = [];
    build([shape('a', 0), object(DRAW_RULES, [uint(PARENT_ID, 1), uint(DRAW_TARGET_ID, 99)])], diagnostics);

    expect(diagnostics.map((entry) => entry.kind)).toEqual(['rive.draw-rule-unresolved']);
    // Drop, not Skip: the feature is supported and the DATA failed, so this is lost data rather than a
    // capability gap. Pinned because a Skip here would exempt itself from every severity-based check.
    expect(diagnostics[0].severity).toBe(ImportDiagnosticSeverity.Drop);
  });
});

function childNames(root: Node2D): string[] {
  const names: string[] = [];
  for (let index = 0; index < getNodeChildCount(root); index++) {
    names.push((getNodeChildAt(root, index) as Node2D).name ?? '');
  }
  return names;
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
