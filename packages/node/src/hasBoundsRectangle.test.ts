import { createRectangle } from '@flighthq/geometry';
import type { HasBoundsRectangle, HasBoundsRectangleRuntime, SceneNode, SceneNodeRuntime } from '@flighthq/types';

import {
  defaultComputeLocalBoundsRectangle,
  initBoundsRectangleRuntimeTrait,
  initBoundsRectangleTrait,
} from './hasBoundsRectangle';
import { createSceneNode, createSceneNodeRuntime } from './sceneNode';

describe('defaultComputeLocalBoundsRectangle', () => {
  it('is a no-op that does not modify out', () => {
    const out = createRectangle(1, 2, 3, 4);
    const node = createSceneNode(NodeTestKind, NodeTestKind);
    defaultComputeLocalBoundsRectangle(out, node as unknown as SceneNode);
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.width).toBe(3);
    expect(out.height).toBe(4);
  });
});

describe('initBoundsRectangleRuntimeTrait', () => {
  let runtime: HasBoundsRectangleRuntime;

  beforeEach(() => {
    runtime = createSceneNodeRuntime() as SceneNodeRuntime<typeof NodeTestKind, HasBoundsRectangle> &
      HasBoundsRectangleRuntime;
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
    node = createSceneNode(NodeTestKind, NodeTestKind) as SceneNode<typeof NodeTestKind, HasBoundsRectangle> &
      HasBoundsRectangle;
  });

  it('does nothing', () => {
    initBoundsRectangleTrait(node);
  });

  it('allows pre-defined values', () => {
    const base = {};
    initBoundsRectangleTrait(node, base);
  });
});

const NodeTestKind: unique symbol = Symbol('NodeTest');
