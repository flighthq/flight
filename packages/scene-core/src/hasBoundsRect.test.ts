import { createRectangle } from '@flighthq/geometry';
import type { HasBoundsRect, HasBoundsRectRuntime, SceneNode, SceneNodeRuntime } from '@flighthq/types';

import { defaultComputeLocalBoundsRectangle, initBoundsRectRuntimeTrait, initBoundsRectTrait } from './hasBoundsRect';
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

describe('initBoundsRectRuntimeTrait', () => {
  let runtime: HasBoundsRectRuntime;

  beforeEach(() => {
    runtime = createSceneNodeRuntime() as SceneNodeRuntime<typeof NodeTestKind, HasBoundsRect> & HasBoundsRectRuntime;
  });

  it('initializes default values', () => {
    initBoundsRectRuntimeTrait(runtime);

    expect(runtime.boundsRect).toBeNull();
    expect(runtime.localBoundsRect).toBeNull();
    expect(runtime.worldBoundsRect).toBeNull();
    expect(runtime.computeLocalBoundsRect).toStrictEqual(defaultComputeLocalBoundsRectangle);
  });
});

describe('initBoundsRectTrait', () => {
  let node: HasBoundsRect;

  beforeEach(() => {
    node = createSceneNode(NodeTestKind, NodeTestKind) as SceneNode<typeof NodeTestKind, HasBoundsRect> & HasBoundsRect;
  });

  it('does nothing', () => {
    initBoundsRectTrait(node);
  });

  it('allows pre-defined values', () => {
    const base = {};
    initBoundsRectTrait(node, base);
  });
});

const NodeTestKind: unique symbol = Symbol('NodeTest');
