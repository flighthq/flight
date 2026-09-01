import { addNodeChild } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { FlightDocumentLayoutDescriptor, FlightDocumentNode, Node2D, NodeAny } from '@flighthq/types/contract';
import { FlightDocumentRefusalReason } from '@flighthq/types/contract';

import {
  checkFlightDocumentLayoutTargets,
  createFlightDocumentLayoutBindings,
  writeFlightDocumentLayoutBindings,
} from './sceneDocumentLayoutBindings';

describe('checkFlightDocumentLayoutTargets', () => {
  it('distinguishes missing and multiply-authored names', () => {
    const root = createDocumentNode('same', [createDocumentNode('same')]);

    expect(checkFlightDocumentLayoutTargets([createLayout('missing')], root, 2)).toMatchObject({
      path: 'scenes[2].layouts[0].targets[0]',
      reason: FlightDocumentRefusalReason.LayoutTargetUnresolved,
    });
    expect(checkFlightDocumentLayoutTargets([createLayout('same')], root, 2)).toMatchObject({
      path: 'scenes[2].layouts[0].targets[0]',
      reason: FlightDocumentRefusalReason.LayoutTargetAmbiguous,
    });
  });

  it('classifies malformed descriptors and non-document styles as structural refusals', () => {
    const root = createDocumentNode('root');
    const malformed = [
      {
        targets: ['root'],
        tree: {
          nodes: [
            {
              containerStyle: { gap: Number.NaN },
              itemStyle: null,
              kind: 'acme.Flow',
              parentIndex: -1,
            },
          ],
        },
      },
    ] as unknown as FlightDocumentLayoutDescriptor[];

    expect(checkFlightDocumentLayoutTargets(malformed, root, 0)).toMatchObject({
      path: 'scenes[0].layouts[0].tree.nodes[0]',
      reason: FlightDocumentRefusalReason.StructureInvalid,
    });
    expect(
      checkFlightDocumentLayoutTargets([null] as unknown as FlightDocumentLayoutDescriptor[], root, 0),
    ).toMatchObject({
      path: 'scenes[0].layouts[0]',
      reason: FlightDocumentRefusalReason.StructureInvalid,
    });
  });
});

describe('createFlightDocumentLayoutBindings', () => {
  it('replaces authored names with index-matched live node identities', () => {
    const child = createDocumentNode('child');
    const root = createDocumentNode('root', [child]);
    const liveRoot = createDisplayObject({ name: 'root' });
    const liveChild = createDisplayObject({ name: 'child' });
    addNodeChild(liveRoot, liveChild);
    const layout = createLayout('root', 'child');

    const bindings = createFlightDocumentLayoutBindings(
      [layout],
      root,
      new Map<Readonly<FlightDocumentNode>, Node2D>([
        [root, liveRoot],
        [child, liveChild],
      ]),
    );

    expect(bindings?.[0]?.targets).toEqual([liveRoot, liveChild]);
    expect(bindings?.[0]?.tree).toBe(layout.tree);
  });
});

describe('writeFlightDocumentLayoutBindings', () => {
  it('writes Node.name references and clones the document-safe tree', () => {
    const root = createDisplayObject({ name: 'root' });
    const child = createDisplayObject({ name: 'child' });
    addNodeChild(root, child);
    const documentRoot = createDocumentNode('root');
    const documentChild = createDocumentNode('child');
    const tree = createLayout('root', 'child').tree;

    const layouts = writeFlightDocumentLayoutBindings(
      [{ targets: [root, child], tree }],
      root,
      new Map<Readonly<NodeAny>, Readonly<FlightDocumentNode>>([
        [root, documentRoot],
        [child, documentChild],
      ]),
    );

    expect(layouts).toEqual([{ targets: ['root', 'child'], tree }]);
    expect(layouts[0].tree).not.toBe(tree);
    expect(layouts[0].tree.nodes[0].containerStyle).not.toBe(tree.nodes[0].containerStyle);
  });

  it('rejects duplicate and foreign live targets as writer misuse', () => {
    const root = createDisplayObject({ name: 'root' });
    const foreign = createDisplayObject({ name: 'foreign' });
    const documentRoot = createDocumentNode('root');
    const written = new Map<Readonly<NodeAny>, Readonly<FlightDocumentNode>>([[root, documentRoot]]);

    expect(() =>
      writeFlightDocumentLayoutBindings([{ targets: [foreign], tree: createLayout('foreign').tree }], root, written),
    ).toThrow(RangeError);
    expect(() =>
      writeFlightDocumentLayoutBindings(
        [
          { targets: [root], tree: createLayout('root').tree },
          { targets: [root], tree: createLayout('root').tree },
        ],
        root,
        written,
      ),
    ).toThrow(RangeError);
  });
});

function createDocumentNode(name: string, children: FlightDocumentNode[] = []): FlightDocumentNode {
  return { children, fields: { name }, kind: 'DisplayObject' };
}

function createLayout(...targets: string[]): FlightDocumentLayoutDescriptor {
  return {
    targets,
    tree: {
      nodes: targets.map((_target, index) => ({
        containerStyle: index === 0 ? { gap: 8 } : null,
        itemStyle: index === 0 ? null : { grow: 1 },
        kind: index === 0 ? 'acme.Flow' : 'acme.Leaf',
        parentIndex: index - 1,
      })),
    },
  };
}
