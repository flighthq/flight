import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type { ImportDiagnostic, Node2D } from '@flighthq/types/contract';
import { DisplayObjectKind } from '@flighthq/types/contract';

import { getRiveCoreTypeName, isRiveCoreTypeDerivedFrom } from './riveCoreTypes';
import { createScene2DFromRiveDocument, initializeRiveDocumentImportResult } from './riveScene2D';

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

  // Every one of the 3,776 paths in the reference corpus is the direct child of a Shape, so this is
  // a malformed file rather than a shape of the format — but the geometry would otherwise disappear
  // without trace, which is what earns the crumb.
  it('crumbs a path that is not owned by a shape instead of dropping it silently', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]),
        object(NODE, [uint(PARENT_ID, 0)]),
        object(POINTS_PATH, [uint(PARENT_ID, 1)]),
      ]),
      diagnostics,
    );

    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual(['rive.path-outside-shape']);
  });

  // A drawable this reader does not build keeps its name, transform and children and simply paints
  // nothing. The tree keeps its shape and the object count is unchanged, so only the pixels go missing.
  it('crumbs a drawable kind it does not build instead of yielding a silent empty container', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const result = createScene2DFromRiveDocument(
      buildRive([object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]), object(TEXT_INPUT, [uint(PARENT_ID, 0)])]),
      diagnostics,
    );

    // The node survives — that is what makes this invisible without the crumb.
    expect(getNodeChildCount(result.artboards[0].root)).toBe(1);
    expect(diagnostics).toMatchObject([
      { detail: { typeKey: TEXT_INPUT }, kind: 'rive.drawable-kind-unsupported', severity: 'Drop' },
    ]);
  });

  it('reports a nine-sliced node imported as a plain container', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const result = createScene2DFromRiveDocument(
      buildRive([object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]), object(NSLICED_NODE, [uint(PARENT_ID, 0)])]),
      diagnostics,
    );

    // The node and its children survive; only the slicing is gone, which is why nothing downstream can
    // notice until a layout resizes it.
    expect(getNodeChildCount(result.artboards[0].root)).toBe(1);
    expect(diagnostics).toMatchObject([
      { detail: { substitutedAs: 'container', typeKey: NSLICED_NODE }, kind: 'rive.nine-slice-substituted' },
    ]);
  });

  it('stays silent for a plain node, which is a container by definition', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const result = createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]),
        object(NODE, [uint(PARENT_ID, 0)]),
        object(LAYOUT_COMPONENT, [uint(PARENT_ID, 0)]),
      ]),
      diagnostics,
    );

    // Both reach the same terminal arm as the drawable above; neither loses anything by doing so, and
    // the child count proves the silence is not the nodes having been dropped instead.
    expect(getNodeChildCount(result.artboards[0].root)).toBe(2);
    expect(diagnostics).toEqual([]);
  });

  it('marks a nested-artboard subclass as a slot rather than reporting it unsupported', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const result = createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]),
        object(NESTED_ARTBOARD_LEAF, [uint(PARENT_ID, 0)]),
      ]),
      diagnostics,
    );

    // A leaf IS a nested artboard, so equality-based dispatch would miss it and the unsupported-drawable
    // arm would claim it — present as a node, but never resolved into a slot by the document layer.
    expect(getNodeChildCount(result.artboards[0].root)).toBe(1);
    expect(diagnostics).toEqual([]);
  });

  // Driven by the core type table rather than a list written here, so a drawable Rive adds later is
  // covered the day the table learns about it. The catch-all report is what makes this hold; the test
  // exists to notice if a future early return ever bypasses it and reintroduces a silent container.
  it('either draws or reports for every drawable the core type table defines', () => {
    const unreported: string[] = [];
    for (let typeKey = 0; typeKey < 1200; typeKey++) {
      const name = getRiveCoreTypeName(typeKey);
      if (name === undefined) continue;
      if (!isRiveCoreTypeDerivedFrom(typeKey, DRAWABLE) || isRiveCoreTypeDerivedFrom(typeKey, LAYOUT_COMPONENT)) {
        continue;
      }
      // A nested artboard is a SLOT: it is marked for the document layer and has no visual of its own,
      // so drawing nothing is correct and reporting would be a false alarm. Excluded by derivation to
      // match the dispatch, which marks the whole subtree as slots.
      if (isRiveCoreTypeDerivedFrom(typeKey, NESTED_ARTBOARD)) continue;
      const diagnostics: ImportDiagnostic[] = [];
      const result = createScene2DFromRiveDocument(
        buildRive([object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]), object(typeKey, [uint(PARENT_ID, 0)])]),
        diagnostics,
      );
      const child =
        getNodeChildCount(result.artboards[0].root) > 0 ? getNodeChildAt(result.artboards[0].root, 0) : null;
      const drew = child !== null && child.kind !== DisplayObjectKind;
      const reported = diagnostics.some((entry) => entry.kind === 'rive.drawable-kind-unsupported');
      if (!drew && !reported) unreported.push(`${name}(${typeKey})`);
    }

    // Named rather than counted: a bare number would say something is uncovered without saying what.
    expect(unreported).toEqual([]);
  });

  // Flight splits blending deliberately: BlendMode is the fixed-function set that folds into blend
  // state, and the destination-reading and non-separable modes are AdvancedBlendMode applied through
  // a BlendEffect. Assigning one of the latter to node.blendMode and getting a silent Normal is the
  // exact bug that split prevents, so the advanced ones are reported rather than dropped.
  it('converts the blend modes that fold into blend state', () => {
    const modes = [
      [3, 'Normal'],
      [14, 'Screen'],
      [16, 'Darken'],
      [17, 'Lighten'],
      [24, 'Multiply'],
    ] as const;
    const result = createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]),
        ...modes.map(([value]) => object(SHAPE, [uint(PARENT_ID, 0), uint(BLEND_MODE, value)])),
      ]),
    );
    const root = result.artboards[0].root;

    modes.forEach(([, expected], index) => {
      expect((getNodeChildAt(root, index) as Node2D).blendMode).toBe(expected);
    });
    expect(result.artboards[0].advancedBlends).toEqual([]);
  });

  it('reports a destination-reading mode for a BlendEffect instead of silently normalising it', () => {
    const advanced = [
      [15, 'Overlay'],
      [18, 'ColorDodge'],
      [19, 'ColorBurn'],
      [20, 'HardLight'],
      [21, 'SoftLight'],
      [22, 'Difference'],
      [23, 'Exclusion'],
      [25, 'Hue'],
      [26, 'Saturation'],
      [27, 'Color'],
      [28, 'Luminosity'],
    ] as const;
    const result = createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]),
        ...advanced.map(([value]) => object(SHAPE, [uint(PARENT_ID, 0), uint(BLEND_MODE, value)])),
      ]),
    );
    const root = result.artboards[0].root;

    expect(result.artboards[0].advancedBlends.map((entry) => entry.mode)).toEqual(advanced.map(([, name]) => name));
    // The node itself stays normal, because the mode is not blend state — the caller applies the effect.
    advanced.forEach((_entry, index) => {
      expect((getNodeChildAt(root, index) as Node2D).blendMode).toBe('Normal');
    });
    expect(result.artboards[0].advancedBlends[0].node).toBe(getNodeChildAt(root, 0));
  });

  it("leaves a plain node's blend mode alone, since only a drawable states one", () => {
    const result = createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]),
        object(NODE, [uint(PARENT_ID, 0), uint(BLEND_MODE, 24)]),
      ]),
    );

    expect((getNodeChildAt(result.artboards[0].root, 0) as Node2D).blendMode).toBeNull();
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

  it('returns authored layout descriptors alongside their display targets', () => {
    const result = createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [float(WIDTH, 100), float(HEIGHT, 50), uint(LAYOUT_STYLE_ID, 1)]),
        object(LAYOUT_COMPONENT_STYLE, [uint(PARENT_ID, 0), uint(LAYOUT_FLEX_DIRECTION, 2)]),
        object(SHAPE, [uint(PARENT_ID, 0), text(NAME, 'item')]),
        object(LAYOUT_PARTICIPANT, [uint(PARENT_ID, 2)]),
      ]),
    );
    const artboard = result.artboards[0];

    expect(artboard.layouts).toHaveLength(1);
    expect(artboard.layouts[0].targets).toEqual([artboard.root, getNodeChildAt(artboard.root, 0)]);
    expect(artboard.layouts[0].tree.nodes).toMatchObject([
      { containerStyle: { direction: 'row' }, itemStyle: null, parentIndex: -1 },
      { containerStyle: null, parentIndex: 0 },
    ]);
  });

  // Bones are TransformComponents rather than nodes, so they never join the display tree; the rig
  // travels beside it. An artboard with no bones carries null rather than an empty skeleton, so a
  // caller pays nothing for a file that rigs nothing.
  it('carries no skeleton for an artboard without bones', () => {
    const result = createScene2DFromRiveDocument(
      buildRive([object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]), object(NODE, [uint(PARENT_ID, 0)])]),
    );

    expect(result.artboards[0].skeleton).toBeNull();
  });

  it('carries the artboard bone rig beside the display tree rather than inside it', () => {
    const result = createScene2DFromRiveDocument(
      buildRive([
        object(ARTBOARD, [float(WIDTH, 10), float(HEIGHT, 10)]),
        object(ROOT_BONE, [uint(PARENT_ID, 0), text(NAME, 'root')]),
      ]),
    );

    expect(result.artboards[0].skeleton?.skeleton.bones.map((bone) => bone.name)).toEqual(['root']);
    // The bone produced no display object, so the tree stays empty.
    expect(getNodeChildCount(result.artboards[0].root)).toBe(0);
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
