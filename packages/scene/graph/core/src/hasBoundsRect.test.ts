import type { GraphNode, HasBoundsRect } from '@flighthq/types';

import { createGraphNode } from './graphNode';
import { getHasBoundsRectRuntime } from './hasBoundsRect';

describe('getHasBoundsRectRuntime', () => {
  it('assumes runtime is defined', () => {
    const node = { kind: NodeTestKind };
    const runtime = getHasBoundsRectRuntime(node as GraphNode<typeof TestGraph> & HasBoundsRect<typeof TestGraph>);
    expect(runtime).toBeUndefined();
  });

  it('returns runtime when defined', () => {
    const node = createGraphNode(TestGraph, NodeTestKind);
    const runtime = getHasBoundsRectRuntime(node as GraphNode<typeof TestGraph> & HasBoundsRect<typeof TestGraph>);
    expect(runtime).not.toBeUndefined();
  });
});

const TestGraph: unique symbol = Symbol('TestGraph');

const NodeTestKind: unique symbol = Symbol('NodeTest');
