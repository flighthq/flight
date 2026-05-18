import type { GraphNode, GraphNodeRuntime, HasBoundsRect, HasBoundsRectRuntime } from '@flighthq/types';

import { createGraphNode, createGraphNodeRuntime } from './graphNode';
import { defaultComputeLocalBoundsRect, initHasBoundsRect, initHasBoundsRectRuntime } from './hasBoundsRect';

describe('initHasBoundsRect', () => {
  let node: HasBoundsRect;

  beforeEach(() => {
    node = createGraphNode(NodeTestKind, NodeTestKind) as GraphNode<typeof NodeTestKind, HasBoundsRect> & HasBoundsRect;
  });

  it('does nothing', () => {
    initHasBoundsRect(node);
  });

  it('allows pre-defined values', () => {
    const base = {};
    initHasBoundsRect(node, base);
  });
});

describe('initHasBoundsRectRuntime', () => {
  let runtime: HasBoundsRectRuntime;

  beforeEach(() => {
    runtime = createGraphNodeRuntime() as GraphNodeRuntime<typeof NodeTestKind, HasBoundsRect> & HasBoundsRectRuntime;
  });

  it('initializes default values', () => {
    initHasBoundsRectRuntime(runtime);

    expect(runtime.boundsRect).toBeNull();
    expect(runtime.localBoundsRect).toBeNull();
    expect(runtime.worldBoundsRect).toBeNull();
    expect(runtime.computeLocalBoundsRect).toStrictEqual(defaultComputeLocalBoundsRect);
  });
});

const NodeTestKind: unique symbol = Symbol('NodeTest');
