import { createRectangle } from '@flighthq/geometry';
import type { GraphNode, GraphNodeRuntime, HasBoundsRect, HasBoundsRectRuntime } from '@flighthq/types';

import { createGraphNode, createGraphNodeRuntime } from './graphNode';
import {
  defaultComputeLocalBoundsRectangle,
  initHasBoundsRectangle,
  initHasBoundsRectangleRuntime,
} from './hasBoundsRect';

describe('defaultComputeLocalBoundsRectangle', () => {
  it('is a no-op that does not modify out', () => {
    const out = createRectangle(1, 2, 3, 4);
    const node = createGraphNode(NodeTestKind, NodeTestKind);
    defaultComputeLocalBoundsRectangle(out, node as unknown as GraphNode);
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.width).toBe(3);
    expect(out.height).toBe(4);
  });
});

describe('initHasBoundsRectangle', () => {
  let node: HasBoundsRect;

  beforeEach(() => {
    node = createGraphNode(NodeTestKind, NodeTestKind) as GraphNode<typeof NodeTestKind, HasBoundsRect> & HasBoundsRect;
  });

  it('does nothing', () => {
    initHasBoundsRectangle(node);
  });

  it('allows pre-defined values', () => {
    const base = {};
    initHasBoundsRectangle(node, base);
  });
});

describe('initHasBoundsRectangleRuntime', () => {
  let runtime: HasBoundsRectRuntime;

  beforeEach(() => {
    runtime = createGraphNodeRuntime() as GraphNodeRuntime<typeof NodeTestKind, HasBoundsRect> & HasBoundsRectRuntime;
  });

  it('initializes default values', () => {
    initHasBoundsRectangleRuntime(runtime);

    expect(runtime.boundsRect).toBeNull();
    expect(runtime.localBoundsRect).toBeNull();
    expect(runtime.worldBoundsRect).toBeNull();
    expect(runtime.computeLocalBoundsRect).toStrictEqual(defaultComputeLocalBoundsRectangle);
  });
});

const NodeTestKind: unique symbol = Symbol('NodeTest');
