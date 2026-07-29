import { createRectangle } from '@flighthq/geometry/contract';
import type { HasBoundsRectangle, HasBoundsRectangleRuntime, Node, NodeRuntime } from '@flighthq/types/contract';

import {
  defaultComputeLocalBoundsRectangle,
  initBoundsRectangleRuntimeTrait,
  initBoundsRectangleTrait,
} from './hasBoundsRectangle';
import { createNode, createNodeRuntime } from './node';

describe('defaultComputeLocalBoundsRectangle', () => {
  it('writes empty bounds', () => {
    const out = createRectangle(1, 2, 3, 4);
    const node = createNode(NodeTestKind);
    defaultComputeLocalBoundsRectangle(out, node as unknown as Node);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });
});

describe('initBoundsRectangleRuntimeTrait', () => {
  let runtime: HasBoundsRectangleRuntime;

  beforeEach(() => {
    runtime = createNodeRuntime() as NodeRuntime<HasBoundsRectangle> & HasBoundsRectangleRuntime;
  });

  it('initializes default values', () => {
    initBoundsRectangleRuntimeTrait(runtime);

    expect(runtime.boundsRectangle).toBeNull();
    expect(runtime.localBoundsRectangle).toBeNull();
    expect(runtime.worldBoundsRectangle).toBeNull();
    expect(runtime.computeLocalBoundsRectangle).toStrictEqual(defaultComputeLocalBoundsRectangle);
  });
});

describe('initBoundsRectangleTrait', () => {
  let node: HasBoundsRectangle;

  beforeEach(() => {
    node = createNode(NodeTestKind) as Node<HasBoundsRectangle> & HasBoundsRectangle;
  });

  it('does nothing', () => {
    initBoundsRectangleTrait(node);
  });

  it('allows pre-defined values', () => {
    const base = {};
    initBoundsRectangleTrait(node, base);
  });
});

const NodeTestKind = 'NodeTest';
