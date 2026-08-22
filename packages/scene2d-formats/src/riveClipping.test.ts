import { clipRegionContainsPoint } from '@flighthq/clip/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  DisplayObject,
  ImportDiagnostic,
  RiveArtboardGraph,
  RiveCoreObject,
  RivePathRecord,
} from '@flighthq/types/contract';
import { PathCommand, RiveFieldType } from '@flighthq/types/contract';

import { applyRiveClipping } from './riveClipping';

// The coordinate transfer is what these cases exist for. Rive states the clip's geometry in the
// SOURCE shape's chain; Flight rasterizes a clip under the CLIPPED node's transform. So the contours
// must arrive already moved from one chain into the other, and the assertions below are computed
// from that displacement rather than read back out of the implementation.

const ARTBOARD = 1;
const NODE = 2;
const SHAPE = 3;
const FILL = 20;
const CLIPPING_SHAPE = 42;
const X = 13;
const Y = 14;
const ROTATION = 15;
const SOURCE_ID = 92;
const FILL_RULE = 93;
const IS_VISIBLE = 94;

describe('applyRiveClipping', () => {
  it('moves the clip from the source chain into the clipped node chain', () => {
    // Source shape sits at x=100, clipped node at x=30, so a source point at x=0 lands at x=70 in
    // the clipped node's own space.
    const scene = build([
      object(ARTBOARD, {}),
      object(SHAPE, { [X]: 30 }),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 3 }),
      object(SHAPE, { [X]: 100 }),
    ]);
    scene.parents = [-1, 0, 1, 0];
    const clip = run(scene, { 3: [square()] });

    expect(clip!.contours![0].slice(0, 2)).toEqual([70, 0]);
  });

  it('accounts for rotation in either chain, not only translation', () => {
    const scene = build([
      object(ARTBOARD, {}),
      object(SHAPE, { [ROTATION]: Math.PI / 2 }),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 3 }),
      object(SHAPE, { [X]: 10 }),
    ]);
    scene.parents = [-1, 0, 1, 0];
    const clip = run(scene, { 3: [square()] });

    // The clipped node is turned a quarter turn, so the source's +x offset becomes -y under its
    // inverse. A translation-only conversion would leave the point at (10, 0).
    expect(clip!.contours![0][0]).toBeCloseTo(0, 6);
    expect(clip!.contours![0][1]).toBeCloseTo(-10, 6);
  });

  it('inherits the transform of an ancestor that carries one', () => {
    const scene = build([
      object(ARTBOARD, {}),
      object(NODE, { [X]: 5 }),
      object(SHAPE, {}),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 4 }),
      object(SHAPE, { [X]: 100 }),
    ]);
    scene.parents = [-1, 0, 1, 2, 0];
    // The clipping shape hangs off index 2, so that is the node the clip lands on.
    const clip = run(scene, { 4: [square()] }, undefined, 2);

    // The clipped shape inherits x=5 from its parent node, so the gap narrows to 95.
    expect(clip!.contours![0].slice(0, 2)).toEqual([95, 0]);
  });

  it('inherits a transform from a parent that follows it in the component stream', () => {
    const scene = build([
      object(ARTBOARD, {}),
      object(SHAPE, { [X]: 5 }),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 4 }),
      object(NODE, { [X]: 40 }),
      object(SHAPE, { [X]: 100 }),
    ]);
    // Index 1 is a legal forward reference: its parent is component 3, which appears later in the
    // flat stream. Its own x=5 composes after the parent's x=40.
    scene.parents = [-1, 3, 1, 0, 0];
    const clip = run(scene, { 4: [square()] });

    expect(clip!.contours![0].slice(0, 2)).toEqual([55, 0]);
  });

  // A non-node component holds no transform of its own, so a node beneath one must still inherit
  // what that component's own parent carries rather than restarting at the identity.
  it('passes an ancestor transform through a component that holds none', () => {
    const scene = build([
      object(ARTBOARD, {}),
      object(NODE, { [X]: 40 }),
      object(FILL, {}),
      object(SHAPE, {}),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 5 }),
      object(SHAPE, { [X]: 100 }),
    ]);
    // The clipped shape at index 3 sits under a Fill, which holds no transform of its own but hangs
    // off the node at index 1.
    scene.parents = [-1, 0, 1, 2, 3, 0];
    const clip = run(scene, { 5: [square()] }, undefined, 3);

    // Index 3 inherits x=40 through the transformless component, so the gap is 60, not 100.
    expect(clip!.contours![0].slice(0, 2)).toEqual([60, 0]);
  });

  it('applies the fill rule the clipping shape states', () => {
    const scene = build([
      object(ARTBOARD, {}),
      object(SHAPE, {}),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 3, [FILL_RULE]: 1 }),
      object(SHAPE, {}),
    ]);
    scene.parents = [-1, 0, 1, 0];

    const clip = run(scene, { 3: [rectangle(0, 0, 10, 10), rectangle(0, 0, 10, 10)] })!;

    // The duplicate contours cancel under even-odd. The resolved clip is canonically non-zero, so
    // filled-region behavior—not retention of the source tag—is the semantic contract.
    expect(clip.winding).toBe('nonZero');
    expect(clipRegionContainsPoint(clip, 5, 5)).toBe(false);
  });

  it('ignores a clipping shape the file marks invisible', () => {
    const scene = build([
      object(ARTBOARD, {}),
      object(SHAPE, {}),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 3, [IS_VISIBLE]: 0 }),
      object(SHAPE, {}),
    ]);
    scene.parents = [-1, 0, 1, 0];

    expect(run(scene, { 3: [square()] })).toBeNull();
  });

  it('crumbs a clipping shape whose source has no geometry', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const scene = build([object(ARTBOARD, {}), object(SHAPE, {}), object(CLIPPING_SHAPE, { [SOURCE_ID]: 99 })]);
    scene.parents = [-1, 0, 1];
    run(scene, {}, diagnostics);

    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual(['rive.unresolved-clipping-source']);
  });

  it('throws for a parent cycle instead of substituting the root transform', () => {
    const scene = build([
      object(ARTBOARD, {}),
      object(SHAPE, {}),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 3 }),
      object(SHAPE, {}),
    ]);
    scene.parents = [-1, 3, 1, 1];

    expect(() => run(scene, { 3: [square()] })).toThrow('Rive component parent cycle');
  });

  it('throws for an unresolved transform parent instead of substituting the root transform', () => {
    const scene = build([
      object(ARTBOARD, {}),
      object(SHAPE, {}),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 3 }),
      object(SHAPE, {}),
    ]);
    scene.parents = [-1, 99, 1, 0];

    expect(() => run(scene, { 3: [square()] })).toThrow('Rive component 1 has unresolved parent 99');
  });

  it('intersects several clipping shapes on one node', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const scene = build([
      object(ARTBOARD, {}),
      object(SHAPE, {}),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 4 }),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 5 }),
      object(SHAPE, {}),
      object(SHAPE, {}),
    ]);
    scene.parents = [-1, 0, 1, 1, 0, 0];
    const clip = run(scene, { 4: [rectangle(0, 0, 10, 10)], 5: [rectangle(5, 0, 10, 10)] }, diagnostics)!;

    expect(clipRegionContainsPoint(clip, 7, 5)).toBe(true);
    expect(clipRegionContainsPoint(clip, 2, 5)).toBe(false);
    expect(clipRegionContainsPoint(clip, 12, 5)).toBe(false);
    expect(diagnostics).toEqual([]);
  });

  it('intersects the complete contour set rather than one contour from each shape', () => {
    const scene = build([
      object(ARTBOARD, {}),
      object(SHAPE, {}),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 4 }),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 5 }),
      object(SHAPE, {}),
      object(SHAPE, {}),
    ]);
    scene.parents = [-1, 0, 1, 1, 0, 0];
    const clip = run(scene, {
      4: [rectangle(0, 0, 10, 10), rectangle(20, 0, 10, 10)],
      5: [rectangle(5, -5, 20, 20)],
    })!;

    expect(clip.contours).toHaveLength(2);
    expect(clipRegionContainsPoint(clip, 7, 5)).toBe(true);
    expect(clipRegionContainsPoint(clip, 22, 5)).toBe(true);
    expect(clipRegionContainsPoint(clip, 15, 5)).toBe(false);
  });

  it('resolves each clipping shape under its own fill rule before intersecting', () => {
    const scene = build([
      object(ARTBOARD, {}),
      object(SHAPE, {}),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 4, [FILL_RULE]: 1 }),
      object(CLIPPING_SHAPE, { [SOURCE_ID]: 5 }),
      object(SHAPE, {}),
      object(SHAPE, {}),
    ]);
    scene.parents = [-1, 0, 1, 1, 0, 0];
    const duplicate = rectangle(0, 0, 10, 10);
    const clip = run(scene, {
      // Even-odd removes the twice-covered first operand; the second remains ordinary non-zero.
      4: [duplicate, rectangle(0, 0, 10, 10)],
      5: [rectangle(0, 0, 10, 10)],
    })!;

    expect(clipRegionContainsPoint(clip, 5, 5)).toBe(false);
  });
});

interface TestScene {
  objects: RiveCoreObject[];
  parents: number[];
}

function run(
  scene: TestScene,
  paths: Readonly<Record<number, RivePathRecord[]>>,
  diagnostics?: ImportDiagnostic[],
  clipped = 1,
): DisplayObject['clip'] {
  const artboard: RiveArtboardGraph = {
    objects: scene.objects,
    parentIndices: scene.parents,
    streamEnd: scene.objects.length,
    streamStart: 0,
  };
  const nodes: Array<DisplayObject | null> = scene.objects.map((object, index) =>
    index === 0 || object.typeKey === SHAPE || object.typeKey === NODE ? createDisplayObject() : null,
  );
  const shapePaths = new Map<number, RivePathRecord[]>(
    Object.entries(paths).map(([key, value]) => [Number(key), value]),
  );
  applyRiveClipping(nodes, artboard, shapePaths, diagnostics);
  return nodes[clipped]!.clip;
}

function build(objects: RiveCoreObject[]): TestScene {
  return { objects, parents: objects.map((_value, index) => (index === 0 ? -1 : 0)) };
}

function square(): RivePathRecord {
  return {
    commands: [PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO],
    data: [0, 0, 10, 0, 10, 10],
    pathIndex: 0,
    winding: 'nonZero',
  };
}

function rectangle(x: number, y: number, width: number, height: number): RivePathRecord {
  return {
    commands: [PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.CLOSE],
    data: [x, y, x + width, y, x + width, y + height, x, y + height],
    pathIndex: 0,
    winding: 'nonZero',
  };
}

function object(typeKey: number, properties: Readonly<Record<number, number>>): RiveCoreObject {
  return {
    properties: Object.entries(properties).map(([key, value]) => ({
      key: Number(key),
      type: RiveFieldType.Double,
      value,
    })),
    typeKey,
  };
}
