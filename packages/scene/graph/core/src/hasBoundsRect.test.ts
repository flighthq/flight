import type { GraphNode, HasBoundsRect, HasBoundsRectRuntime } from '@flighthq/types';

import { createGraphNode, createGraphNodeRuntime } from './graphNode';
import { defaultComputeLocalBoundsRect, initHasBoundsRect, initHasBoundsRectRuntime } from './hasBoundsRect';

describe('initHasBoundsRect', () => {
  let node: HasBoundsRect<typeof TestGraph>;

  beforeEach(() => {
    node = createGraphNode(TestGraph, NodeTestKind) as GraphNode<typeof TestGraph> & HasBoundsRect<typeof TestGraph>;
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
  let runtime: HasBoundsRectRuntime<typeof TestGraph>;

  beforeEach(() => {
    runtime = createGraphNodeRuntime() as HasBoundsRectRuntime<typeof TestGraph>;
  });

  it('initializes default values', () => {
    initHasBoundsRectRuntime(runtime);

    expect(runtime.boundsRect).toBeNull();
    expect(runtime.localBoundsRect).toBeNull();
    expect(runtime.worldBoundsRect).toBeNull();
    expect(runtime.computeLocalBoundsRect).toStrictEqual(defaultComputeLocalBoundsRect);
  });
});

const TestGraph: unique symbol = Symbol('TestGraph');

const NodeTestKind: unique symbol = Symbol('NodeTest');
