import { getEntityRuntime as _getRuntime } from '@flighthq/entity/contract';
import {
  cloneRectangle,
  createRectangle,
  equalsRectangle,
  setEmptyRectangle as setEmpty,
  setRectangle,
} from '@flighthq/geometry/contract';
import {
  addNodeChild,
  createNode,
  ensureNodeLocalMatrix,
  initTransform2DRuntimeTrait,
  initTransform2DTrait,
  invalidateNodeLocalTransform,
  removeNodeChild,
  setNodeEnabled,
} from '@flighthq/node/contract';
import type {
  HasBoundsRectangle,
  HasBoundsRectangleRuntime,
  HasTransform2D,
  HasTransform2DRuntime,
  Node,
  NodeRuntime,
  Rectangle,
} from '@flighthq/types/contract';

import {
  computeNodeBoundsRectangle,
  computeNodeRootLocalBoundsRectangle,
  ensureNodeLocalBoundsRectangle,
  ensureNodeParentBoundsRectangle,
  ensureNodeWorldBoundsRectangle,
  getNodeHeight,
  getNodeLocalBoundsRectangle,
  getNodeParentBoundsRectangle,
  getNodeWidth,
  getNodeWorldBoundsRectangle,
  setNodeHeight,
  setNodeWidth,
} from './boundsRectangle';
import { initBoundsRectangleRuntimeTrait, initBoundsRectangleTrait } from './hasBoundsRectangle';

function getEntityRuntime(
  source: TestNode,
): NodeRuntime<HasBoundsRectangle & HasTransform2D> & HasBoundsRectangleRuntime & HasTransform2DRuntime {
  return _getRuntime(source) as NodeRuntime<HasBoundsRectangle & HasTransform2D> &
    HasBoundsRectangleRuntime &
    HasTransform2DRuntime;
}

function createTestNode(): TestNode {
  const node = createNode(TestKind) as TestNode;
  const runtime = _getRuntime(node);
  initBoundsRectangleTrait(node);
  initBoundsRectangleRuntimeTrait(runtime as HasBoundsRectangleRuntime);
  initTransform2DTrait(node);
  initTransform2DRuntimeTrait(runtime as HasTransform2DRuntime);
  return node;
}

describe('computeNodeBoundsRectangle', () => {
  let root: TestNode;
  let child: TestNode;
  let grandChild: TestNode;

  beforeEach(() => {
    root = createTestNode();
    child = createTestNode();
    grandChild = createTestNode();

    child.x = 100;
    child.y = 100;

    addNodeChild(root, child);
    addNodeChild(child, grandChild);

    // fake local bounds
    setRectangle(getNodeLocalBoundsRectangle(root), 0, 0, 100, 100);
    setRectangle(getNodeLocalBoundsRectangle(child), 10, 20, 50, 50);
    setRectangle(getNodeLocalBoundsRectangle(grandChild), 5, 5, 100, 100);
  });

  it('should equal local bounds when targetCoordinateSpace is self and there are no children', () => {
    const out = createRectangle();
    computeNodeBoundsRectangle(out, grandChild, grandChild);
    expect(equalsRectangle(out, getNodeLocalBoundsRectangle(grandChild))).toBe(true);
  });

  it('should include children bounds when targetCoordinateSpace is self', () => {
    const out = createRectangle();
    computeNodeBoundsRectangle(out, child, child);
    expect(equalsRectangle(out, { x: 5, y: 5, width: 100, height: 100 })).toBe(true);
  });

  it('defaults a null target coordinate space to the source', () => {
    const out = createRectangle();

    computeNodeBoundsRectangle(out, child, null);

    expect(equalsRectangle(out, { x: 5, y: 5, width: 100, height: 100 })).toBe(true);
  });

  it('should compute bounds relative to parent', () => {
    const out = createRectangle();
    computeNodeBoundsRectangle(out, child, root);
    expect(out.x).toBeCloseTo(105);
    expect(out.y).toBeCloseTo(105);
    expect(out.width).toBeCloseTo(100);
    expect(out.height).toBeCloseTo(100);
  });

  it('uses parent-space bounds directly when the parent is nested', () => {
    const out = createRectangle();

    computeNodeBoundsRectangle(out, grandChild, child);

    expect(equalsRectangle(out, getNodeParentBoundsRectangle(grandChild))).toBe(true);
  });

  it('should compute bounds relative to nested child', () => {
    const out = createRectangle();
    computeNodeBoundsRectangle(out, root, grandChild);
    expect(out.x).toBeCloseTo(-100);
    expect(out.y).toBeCloseTo(-100);
    expect(out.width).toBeCloseTo(205);
    expect(out.height).toBeCloseTo(205);
  });

  it('should account for scaling in parent transforms', () => {
    // child is 50x50, should be 100x150 now in parent coordinate space
    child.scaleX = 2;
    child.scaleY = 3;

    const out = createRectangle();
    computeNodeBoundsRectangle(out, child, root);

    expect(out.width).toBeCloseTo(100 * 2);
    expect(out.height).toBeCloseTo(100 * 3);
  });

  it('should account for translation in parent transforms', () => {
    child.x = 5;
    child.y = 7;

    const out = createRectangle();
    computeNodeBoundsRectangle(out, grandChild, root);

    // grandChild localBounds at (5,5) with no scaling
    expect(out.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
    expect(out.y).toBeCloseTo(7 + 5);
  });

  it('should handle rotation', () => {
    child.rotation = 90;

    const out = createRectangle();
    computeNodeBoundsRectangle(out, child, root);
    expect(out.width).toBeCloseTo(100); // roughly unchanged
    expect(out.height).toBeCloseTo(100);
  });

  it('should allow a rectangle-like object', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    computeNodeBoundsRectangle(out, grandChild, grandChild);
    expect(equalsRectangle(out, getNodeLocalBoundsRectangle(grandChild))).toBe(true);
  });

  it('should compute bounds relative to an unrelated target', () => {
    const out = createRectangle();
    const unrelatedTarget = createTestNode(); // another object in a separate scene graph
    computeNodeBoundsRectangle(out, child, unrelatedTarget);
    expect(equalsRectangle(out, getNodeWorldBoundsRectangle(child))).toBe(true);
  });

  it('converts through world space for a nested unrelated target', () => {
    const unrelatedRoot = createTestNode();
    const unrelatedTarget = createTestNode();
    addNodeChild(unrelatedRoot, unrelatedTarget);
    const out = createRectangle();

    computeNodeBoundsRectangle(out, grandChild, unrelatedTarget);

    expect(equalsRectangle(out, getNodeWorldBoundsRectangle(grandChild))).toBe(true);
  });

  it('should return world bounds if the target coordinate space is root', () => {
    const out = createRectangle();
    computeNodeBoundsRectangle(out, child, root);
    expect(equalsRectangle(out, getNodeWorldBoundsRectangle(child))).toBe(true);
  });

  it('removes a detached target transform from target-relative bounds', () => {
    root.x = 40;
    root.y = -25;
    invalidateNodeLocalTransform(root);
    const out = createRectangle();

    computeNodeBoundsRectangle(out, child, root);

    expect(out.x).toBeCloseTo(105);
    expect(out.y).toBeCloseTo(105);
    expect(out.width).toBeCloseTo(100);
    expect(out.height).toBeCloseTo(100);
  });
});

describe('computeNodeRootLocalBoundsRectangle', () => {
  it('ignores the detached root transform while preserving negative local extents', () => {
    const root = createTestNode();
    root.x = 120;
    root.y = -35;
    root.rotation = 37;
    root.scaleX = 2;
    root.scaleY = 0.5;
    setRectangle(getNodeLocalBoundsRectangle(root), -10, -5, 30, 20);

    const out = createRectangle();
    computeNodeRootLocalBoundsRectangle(out, root);

    expect(out).toMatchObject({ x: -10, y: -5, width: 30, height: 20 });
  });

  it('composes nested transforms relative to an identity root', () => {
    const root = createTestNode();
    const child = createTestNode();
    root.x = 500;
    root.rotation = 90;
    child.x = 20;
    child.y = 3;
    child.scaleX = 2;
    child.scaleY = 3;
    setRectangle(getNodeLocalBoundsRectangle(root), 0, 0, 10, 10);
    setRectangle(getNodeLocalBoundsRectangle(child), -5, -2, 4, 8);
    addNodeChild(root, child);

    const out = createRectangle();
    computeNodeRootLocalBoundsRectangle(out, root);

    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(-3);
    expect(out.width).toBeCloseTo(18);
    expect(out.height).toBeCloseTo(24);
  });

  it('composes transforms at every descendant depth', () => {
    const root = createTestNode();
    const child = createTestNode();
    const grandchild = createTestNode();
    setRectangle(getNodeLocalBoundsRectangle(root), 0, 0, 1, 1);
    setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 1, 1);
    setRectangle(getNodeLocalBoundsRectangle(grandchild), 0, 0, 2, 2);
    child.x = 10;
    grandchild.x = 20;
    addNodeChild(root, child);
    addNodeChild(child, grandchild);

    const out = createRectangle();
    computeNodeRootLocalBoundsRectangle(out, root);

    expect(out).toMatchObject({ x: 0, y: 0, width: 32, height: 2 });
  });

  it('excludes disabled descendants', () => {
    const root = createTestNode();
    const child = createTestNode();
    setRectangle(getNodeLocalBoundsRectangle(root), 0, 0, 10, 10);
    setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 20, 20);
    child.x = 100;
    child.enabled = false;
    addNodeChild(root, child);

    const out = createRectangle();
    computeNodeRootLocalBoundsRectangle(out, root);

    expect(out).toMatchObject({ x: 0, y: 0, width: 10, height: 10 });
  });
});

describe('ensureNodeLocalBoundsRectangle', () => {
  it('recalculates when the kind-owned validity hook rejects an unchanged revision', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    let input = { width: 10 };
    let stampedInput = input;
    runtime.computeLocalBoundsRectangle = (out: Rectangle) => {
      out.width = input.width;
      stampedInput = input;
    };
    runtime.isLocalBoundsRectangleValid = () => stampedInput === input;
    ensureNodeLocalBoundsRectangle(object);

    input = { width: 20 };
    ensureNodeLocalBoundsRectangle(object);

    expect(runtime.localBoundsRectangle?.width).toBe(20);
  });

  it('should ensure localBoundsRectangle is defined', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    expect(runtime.localBoundsRectangle).toBeNull();
    ensureNodeLocalBoundsRectangle(object);
    expect(runtime.localBoundsRectangle).not.toBeNull();
  });

  it('should not recalculate if localBoundsId is unchanged', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    runtime.computeLocalBoundsRectangle = (out: Rectangle, _source: Node) => {
      setEmpty(out);
    };
    ensureNodeLocalBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.localBoundsRectangle!);
    ensureNodeLocalBoundsRectangle(object);
    expect(runtime.localBoundsRectangle).not.toEqual(cache);
  });

  it('should recalculate if localBoundsId is changed', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    runtime.computeLocalBoundsRectangle = (out: Rectangle, _source: Node) => {
      setEmpty(out);
    };
    ensureNodeLocalBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.localBoundsRectangle!);
    runtime.localBoundsId++;
    ensureNodeLocalBoundsRectangle(object);
    expect(equalsRectangle(runtime.localBoundsRectangle, cache)).toBe(true);
  });

  it('should not recalculate if localTransformId is unchanged', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    runtime.computeLocalBoundsRectangle = (out: Rectangle, _source: Node) => {
      setEmpty(out);
    };
    ensureNodeLocalBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.localBoundsRectangle!);
    runtime.localTransformId++;
    ensureNodeLocalBoundsRectangle(object);
    expect(runtime.localBoundsRectangle).not.toEqual(cache);
  });
});

describe('ensureNodeParentBoundsRectangle', () => {
  it('should ensure boundsRectangle is defined', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    expect(runtime.boundsRectangle).toBeNull();
    ensureNodeParentBoundsRectangle(object);
    expect(runtime.boundsRectangle).not.toBeNull();
  });

  it('should not recalculate if localBoundsId and localTransformId are unchanged', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    ensureNodeParentBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.boundsRectangle!);
    ensureNodeParentBoundsRectangle(object);
    expect(runtime.boundsRectangle).not.toEqual(cache);
  });

  it('should recalculate if localBoundsId is changed', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    runtime.computeLocalBoundsRectangle = (out: Rectangle, _source: Node) => {
      setEmpty(out);
    };
    ensureNodeParentBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.boundsRectangle!);
    runtime.localBoundsId++;
    ensureNodeParentBoundsRectangle(object);
    expect(equalsRectangle(runtime.boundsRectangle, cache)).toBe(true);
  });

  it('should recalculate if localTransformId is changed', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    ensureNodeParentBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.boundsRectangle!);
    runtime.localTransformId++;
    ensureNodeParentBoundsRectangle(object);
    expect(equalsRectangle(runtime.boundsRectangle, cache)).toBe(true);
  });
});

describe('ensureNodeWorldBoundsRectangle', () => {
  it('should ensure worldBoundsRectangle is defined', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    expect(runtime.worldBoundsRectangle).toBeNull();
    ensureNodeWorldBoundsRectangle(object);
    expect(runtime.worldBoundsRectangle).not.toBeNull();
  });

  it('recomputes when bounds are cached before the world matrix exists', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    getNodeLocalBoundsRectangle(object);
    runtime.worldBoundsRectangle = createRectangle(5, 5, 10, 10);
    runtime.worldBoundsUsingLocalBoundsId = runtime.localBoundsId;
    expect(runtime.worldMatrix).toBeNull();

    ensureNodeWorldBoundsRectangle(object);

    expect(runtime.worldMatrix).not.toBeNull();
    expect(runtime.worldBoundsRectangle).toMatchObject({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('should not recalculate if localBoundsId and worldTransformId are unchanged', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    ensureNodeWorldBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.worldBoundsRectangle!);
    ensureNodeWorldBoundsRectangle(object);
    expect(runtime.worldBoundsRectangle).not.toEqual(cache);
  });

  it('should recalculate if localBoundsId is changed', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    ensureNodeWorldBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.worldBoundsRectangle!);
    runtime.localBoundsId++;
    ensureNodeWorldBoundsRectangle(object);
    expect(equalsRectangle(runtime.worldBoundsRectangle, cache)).toBe(true);
  });

  it('should recalculate if local transform is changed (translate)', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    ensureNodeWorldBoundsRectangle(object);
    const cache = cloneRectangle(runtime.worldBoundsRectangle!);
    object.x = 100;
    invalidateNodeLocalTransform(object);
    ensureNodeWorldBoundsRectangle(object);
    expect(runtime.worldBoundsRectangle).not.toEqual(cache);
    expect(equalsRectangle(runtime.worldBoundsRectangle, { x: 100, y: 0, width: 0, height: 0 })).toBe(true);
  });

  it('should recalculate if local transform is changed (scale)', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    ensureNodeWorldBoundsRectangle(object);
    const cache = cloneRectangle(runtime.worldBoundsRectangle!);
    const localBounds = getNodeLocalBoundsRectangle(object) as Rectangle;
    // write the cached rectangle directly (bypassing invalidation) so the scaled recalculation is observable
    localBounds.width = 10;
    object.scaleX = 2;
    invalidateNodeLocalTransform(object);
    ensureNodeWorldBoundsRectangle(object);
    expect(runtime.worldBoundsRectangle).not.toEqual(cache);
    expect(equalsRectangle(runtime.worldBoundsRectangle, { x: 0, y: 0, width: 20, height: 0 })).toBe(true);
  });

  it('should recalculate if parent transform is changed (translate)', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);
    const runtime = getEntityRuntime(child);
    ensureNodeWorldBoundsRectangle(child);
    const cache = cloneRectangle(runtime.worldBoundsRectangle!);
    parent.x = 100;
    invalidateNodeLocalTransform(parent);
    ensureNodeWorldBoundsRectangle(child);
    expect(runtime.worldBoundsRectangle).not.toEqual(cache);
    expect(equalsRectangle(runtime.worldBoundsRectangle, { x: 100, y: 0, width: 0, height: 0 })).toBe(true);
  });

  it('should recalculate if parent transform is changed (scale)', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);
    const runtime = getEntityRuntime(child);
    ensureNodeWorldBoundsRectangle(child);
    // write the cached rectangles directly (bypassing invalidation) so the scaled recalculation is observable
    const localBounds = getNodeLocalBoundsRectangle(child) as Rectangle;
    localBounds.width = 10;
    const worldBounds = getNodeWorldBoundsRectangle(child) as Rectangle;
    worldBounds.width = 10;
    const cache = cloneRectangle(runtime.worldBoundsRectangle!);
    parent.scaleX = 2;
    invalidateNodeLocalTransform(parent);
    ensureNodeLocalMatrix(parent);
    ensureNodeWorldBoundsRectangle(child);
    expect(runtime.worldBoundsRectangle).not.toEqual(cache);
    expect(equalsRectangle(runtime.worldBoundsRectangle, { x: 0, y: 0, width: 20, height: 0 })).toBe(true);
  });
});

describe('getNodeHeight', () => {
  it('returns height in parent space with default scale', () => {
    const parent = createTestNode();
    const node = createTestNode();
    addNodeChild(parent, node);
    setRectangle(getNodeLocalBoundsRectangle(node) as Rectangle, 0, 0, 100, 50);
    expect(getNodeHeight(node)).toBeCloseTo(50);
  });

  it('accounts for scaleY', () => {
    const parent = createTestNode();
    const node = createTestNode();
    addNodeChild(parent, node);
    setRectangle(getNodeLocalBoundsRectangle(node) as Rectangle, 0, 0, 100, 50);
    node.scaleY = 2;
    invalidateNodeLocalTransform(node);
    expect(getNodeHeight(node)).toBeCloseTo(100);
  });
});

describe('getNodeLocalBoundsRectangle', () => {
  it('should call ensure and return localBoundsRectangle', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    expect(runtime.localBoundsRectangle).toBeNull();
    const rect = getNodeLocalBoundsRectangle(object);
    expect(rect).not.toBeNull();
    expect(rect).toStrictEqual(runtime.localBoundsRectangle);
  });
});

describe('getNodeParentBoundsRectangle', () => {
  it('should call ensure and return boundsRectangle', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    expect(runtime.boundsRectangle).toBeNull();
    const rect = getNodeParentBoundsRectangle(object);
    expect(rect).not.toBeNull();
    expect(rect).toStrictEqual(runtime.boundsRectangle);
  });
});

describe('getNodeWidth', () => {
  it('returns width in parent space with default scale', () => {
    const parent = createTestNode();
    const node = createTestNode();
    addNodeChild(parent, node);
    setRectangle(getNodeLocalBoundsRectangle(node) as Rectangle, 0, 0, 80, 40);
    expect(getNodeWidth(node)).toBeCloseTo(80);
  });

  it('accounts for scaleX', () => {
    const parent = createTestNode();
    const node = createTestNode();
    addNodeChild(parent, node);
    setRectangle(getNodeLocalBoundsRectangle(node) as Rectangle, 0, 0, 80, 40);
    node.scaleX = 3;
    invalidateNodeLocalTransform(node);
    expect(getNodeWidth(node)).toBeCloseTo(240);
  });
});

describe('getNodeWorldBoundsRectangle', () => {
  it('should call ensure and return worldBoundsRectangle', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    expect(runtime.worldBoundsRectangle).toBeNull();
    const rect = getNodeWorldBoundsRectangle(object);
    expect(rect).not.toBeNull();
    expect(rect).toStrictEqual(runtime.worldBoundsRectangle);
  });

  it('excludes a disabled child from world bounds', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);

    setRectangle(getNodeLocalBoundsRectangle(parent) as Rectangle, 0, 0, 10, 10);
    setRectangle(getNodeLocalBoundsRectangle(child) as Rectangle, 0, 0, 200, 200);
    child.x = 100;
    invalidateNodeLocalTransform(child);

    child.enabled = false;

    const bounds = getNodeWorldBoundsRectangle(parent);
    expect(bounds.width).toBeCloseTo(10);
    expect(bounds.height).toBeCloseTo(10);
  });

  it('includes an enabled child in world bounds', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);

    setRectangle(getNodeLocalBoundsRectangle(parent) as Rectangle, 0, 0, 10, 10);
    setRectangle(getNodeLocalBoundsRectangle(child) as Rectangle, 0, 0, 200, 200);
    child.x = 100;
    invalidateNodeLocalTransform(child);

    const bounds = getNodeWorldBoundsRectangle(parent);
    expect(bounds).toMatchObject({ x: 0, y: 0, width: 300, height: 200 });
  });

  it('refreshes cached aggregate bounds when a child moves', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);
    setRectangle(getNodeLocalBoundsRectangle(parent) as Rectangle, 0, 0, 10, 10);
    setRectangle(getNodeLocalBoundsRectangle(child) as Rectangle, 0, 0, 20, 20);
    child.x = 30;
    invalidateNodeLocalTransform(child);
    expect(getNodeWorldBoundsRectangle(parent)).toMatchObject({ x: 0, y: 0, width: 50, height: 20 });

    child.x = 80;
    invalidateNodeLocalTransform(child);

    expect(getNodeWorldBoundsRectangle(parent)).toMatchObject({ x: 0, y: 0, width: 100, height: 20 });
  });

  it('consults a descendant kind-owned bounds validity hook after the aggregate is cached', () => {
    const parent = createTestNode();
    const child = createTestNode();
    const runtime = getEntityRuntime(child);
    let input = { width: 20 };
    let stampedInput = input;
    runtime.computeLocalBoundsRectangle = (out: Rectangle) => {
      setRectangle(out, 100, 0, input.width, 10);
      stampedInput = input;
    };
    runtime.isLocalBoundsRectangleValid = () => stampedInput === input;
    addNodeChild(parent, child);
    setRectangle(getNodeLocalBoundsRectangle(parent) as Rectangle, 0, 0, 10, 10);
    expect(getNodeWorldBoundsRectangle(parent).width).toBe(120);

    input = { width: 50 };

    expect(getNodeWorldBoundsRectangle(parent).width).toBe(150);
  });

  it('refreshes cached aggregate bounds when a child is removed', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);
    setRectangle(getNodeLocalBoundsRectangle(parent) as Rectangle, 0, 0, 10, 10);
    setRectangle(getNodeLocalBoundsRectangle(child) as Rectangle, 100, 0, 200, 200);
    expect(getNodeWorldBoundsRectangle(parent).width).toBe(300);

    removeNodeChild(parent, child);

    expect(getNodeWorldBoundsRectangle(parent)).toMatchObject({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('refreshes cached aggregate bounds when a child is disabled or re-enabled', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);
    setRectangle(getNodeLocalBoundsRectangle(parent) as Rectangle, 0, 0, 10, 10);
    setRectangle(getNodeLocalBoundsRectangle(child) as Rectangle, 100, 0, 200, 200);
    expect(getNodeWorldBoundsRectangle(parent).width).toBe(300);

    setNodeEnabled(child, false);
    expect(getNodeWorldBoundsRectangle(parent).width).toBe(10);

    setNodeEnabled(child, true);
    expect(getNodeWorldBoundsRectangle(parent).width).toBe(300);
  });

  it('ignores an enabled child with zero-area world bounds', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);
    setRectangle(getNodeLocalBoundsRectangle(parent) as Rectangle, 0, 0, 10, 10);
    setRectangle(getNodeLocalBoundsRectangle(child) as Rectangle, 0, 0, 0, 5);
    child.x = 100;
    invalidateNodeLocalTransform(child);

    const bounds = getNodeWorldBoundsRectangle(parent);

    expect(bounds).toMatchObject({ x: 0, y: 0, width: 10, height: 10 });
  });
});

describe('setNodeHeight', () => {
  it('adjusts scaleY to achieve the desired height', () => {
    const parent = createTestNode();
    const node = createTestNode();
    addNodeChild(parent, node);
    setRectangle(getNodeLocalBoundsRectangle(node) as Rectangle, 0, 0, 100, 50);
    setNodeHeight(node, 100);
    expect(getNodeHeight(node)).toBeCloseTo(100);
  });

  it('does nothing when scaleY is zero', () => {
    const node = createTestNode();
    node.scaleY = 0;
    invalidateNodeLocalTransform(node);
    setNodeHeight(node, 100);
    expect(node.scaleY).toBe(0);
  });

  it('keeps a finite scale when the current height is zero', () => {
    const node = createTestNode();
    setRectangle(getNodeLocalBoundsRectangle(node) as Rectangle, 0, 0, 10, 0);

    setNodeHeight(node, 100);

    expect(node.scaleY).toBe(1);
    expect(Number.isFinite(node.scaleY)).toBe(true);
  });
});

describe('setNodeWidth', () => {
  it('adjusts scaleX to achieve the desired width', () => {
    const parent = createTestNode();
    const node = createTestNode();
    addNodeChild(parent, node);
    setRectangle(getNodeLocalBoundsRectangle(node) as Rectangle, 0, 0, 80, 40);
    setNodeWidth(node, 160);
    expect(getNodeWidth(node)).toBeCloseTo(160);
  });

  it('does nothing when scaleX is zero', () => {
    const node = createTestNode();
    node.scaleX = 0;
    invalidateNodeLocalTransform(node);
    setNodeWidth(node, 100);
    expect(node.scaleX).toBe(0);
  });

  it('keeps a finite scale when the current width is zero', () => {
    const node = createTestNode();
    setRectangle(getNodeLocalBoundsRectangle(node) as Rectangle, 0, 0, 0, 10);

    setNodeWidth(node, 100);

    expect(node.scaleX).toBe(1);
    expect(Number.isFinite(node.scaleX)).toBe(true);
  });
});

function cloneAndInvalidateRect(rect: Rectangle): Rectangle {
  const clone = cloneRectangle(rect);
  invalidateRect(rect);
  return clone;
}

function invalidateRect(rect: Rectangle | null): void {
  if (rect !== null) setRectangle(rect, NaN, NaN, NaN, NaN);
}

type TestNode = Node<HasTransform2D & HasBoundsRectangle> & HasTransform2D & HasBoundsRectangle;

const TestKind = 'Test';
