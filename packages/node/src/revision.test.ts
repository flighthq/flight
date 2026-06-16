import { createNode, getNodeRuntime } from '@flighthq/node';
import type { Node, NodeRuntime } from '@flighthq/types';

import {
  computeNodeWorldTransformRevision,
  getNodeAppearanceRevision,
  getNodeLocalBoundsRevision,
  getNodeLocalTransformRevision,
  getNodeWorldTransformRevision,
  invalidateNode,
  invalidateNodeAppearance,
  invalidateNodeLocalBounds,
  invalidateNodeLocalTransform,
  invalidateNodeParentReference,
  invalidateNodeRender,
  invalidateNodeWorldBounds,
} from './revision';

function createTestNode(): TestNode {
  return createNode(TestKind) as TestNode;
}

let node: TestNode;
beforeEach(() => {
  node = createTestNode();
});

function getEntityRuntime(source: TestNode) {
  return getNodeRuntime(source) as NodeRuntime;
}

describe('computeNodeWorldTransformRevision', () => {
  it('updates worldTransformID based on local and parent transform IDs', () => {
    const runtime = getEntityRuntime(node);
    runtime.localTransformID = 3;
    computeNodeWorldTransformRevision(runtime);
    expect(runtime.worldTransformUsingLocalTransformID).toBe(3);
    expect(runtime.worldTransformUsingParentTransformID).toBe(0);
  });

  it('incorporates parent worldTransformID when provided', () => {
    const parentNode = createTestNode();
    const parentRuntime = getEntityRuntime(parentNode);
    parentRuntime.worldTransformID = 7;
    const runtime = getEntityRuntime(node);
    computeNodeWorldTransformRevision(runtime, parentRuntime);
    expect(runtime.worldTransformUsingParentTransformID).toBe(7);
  });
});

describe('getNodeAppearanceRevision', () => {
  it('returns appearanceID', () => {
    const runtime = getEntityRuntime(node);
    runtime.appearanceID = 100;
    expect(getNodeAppearanceRevision(node)).toStrictEqual(runtime.appearanceID);
  });
});

describe('getNodeLocalBoundsRevision', () => {
  it('returns localBoundsID', () => {
    const runtime = getEntityRuntime(node);
    runtime.localBoundsID = 100;
    expect(getNodeLocalBoundsRevision(node)).toStrictEqual(runtime.localBoundsID);
  });
});

describe('getNodeLocalTransformRevision', () => {
  it('returns localTransformID', () => {
    const runtime = getEntityRuntime(node);
    runtime.localTransformID = 100;
    expect(getNodeLocalTransformRevision(node)).toStrictEqual(runtime.localTransformID);
  });
});

describe('getNodeWorldTransformRevision', () => {
  it('returns worldTransformID', () => {
    const runtime = getEntityRuntime(node);
    runtime.worldTransformID = 100;
    expect(getNodeWorldTransformRevision(node)).toStrictEqual(runtime.worldTransformID);
  });
});

describe('invalidateNode', () => {
  it('increments appearanceID, localBoundsID, localTransformID', () => {
    const appearanceID = getEntityRuntime(node).appearanceID;
    const localBoundsID = getEntityRuntime(node).localBoundsID;
    const localTransformID = getEntityRuntime(node).localTransformID;
    invalidateNode(node);
    expect(getEntityRuntime(node).appearanceID).toBe(appearanceID + 1);
    expect(getEntityRuntime(node).localBoundsID).toBe(localBoundsID + 1);
    expect(getEntityRuntime(node).localTransformID).toBe(localTransformID + 1);
  });

  it('invalidates parent reference', () => {
    invalidateNode(node);
    expect(getEntityRuntime(node).worldTransformUsingParentTransformID).toBe(-1);
  });

  it('invalidates world bounds', () => {
    invalidateNode(node);
    expect(getEntityRuntime(node).worldBoundsUsingWorldTransformID).toBe(-1);
    expect(getEntityRuntime(node).worldBoundsUsingLocalBoundsID).toBe(-1);
  });
});

describe('invalidateNodeAppearance', () => {
  it('increments appearanceID', () => {
    const appearanceID = getEntityRuntime(node).appearanceID;
    invalidateNodeAppearance(node);
    expect(getEntityRuntime(node).appearanceID).toBe(appearanceID + 1);
  });

  it('should wrap around appearanceID correctly using >>> 0', () => {
    const runtime = getEntityRuntime(node);
    runtime.appearanceID = 0xffffffff; // max 32-bit uint
    invalidateNodeAppearance(node);
    expect(getEntityRuntime(node).appearanceID).toBe(0);
  });
});

describe('invalidateNodeLocalBounds', () => {
  it('increments localBoundsID', () => {
    const localBoundsID = getEntityRuntime(node).localBoundsID;
    invalidateNodeLocalBounds(node);
    expect(getEntityRuntime(node).localBoundsID).toBe(localBoundsID + 1);
  });

  it('should wrap around localBoundsID correctly using >>> 0', () => {
    const runtime = getEntityRuntime(node);
    runtime.localBoundsID = 0xffffffff; // max 32-bit uint
    invalidateNodeLocalBounds(node);
    expect(getEntityRuntime(node).localBoundsID).toBe(0);
  });
});

describe('invalidateNodeLocalTransform', () => {
  it('increments localTransformID', () => {
    const localTransformID = getEntityRuntime(node).localTransformID;
    invalidateNodeLocalTransform(node);
    expect(getEntityRuntime(node).localTransformID).toBe(localTransformID + 1);
  });

  it('should wrap around localTransformID correctly using >>> 0', () => {
    const runtime = getEntityRuntime(node);
    runtime.localTransformID = 0xffffffff; // max 32-bit uint
    invalidateNodeLocalTransform(node);
    expect(getEntityRuntime(node).localTransformID).toBe(0);
  });
});

describe('invalidateNodeParentReference', () => {
  it('invalidates the world transform parent transform cached ID', () => {
    const runtime = getEntityRuntime(node);
    runtime.worldTransformUsingParentTransformID = 1;
    invalidateNodeParentReference(node);
    expect(runtime.worldTransformUsingParentTransformID).toBe(-1);
  });
});

describe('invalidateNodeRender', () => {
  it('increments both appearanceID and localTransformID', () => {
    const runtime = getEntityRuntime(node);
    const prevAppearance = runtime.appearanceID;
    const prevLocalTransform = runtime.localTransformID;
    invalidateNodeRender(node);
    expect(runtime.appearanceID).toBe(prevAppearance + 1);
    expect(runtime.localTransformID).toBe(prevLocalTransform + 1);
  });
});

describe('invalidateNodeWorldBounds', () => {
  it('invalidates supporting values for world bounds calculations', () => {
    const runtime = getEntityRuntime(node);
    runtime.worldBoundsUsingWorldTransformID = 1;
    runtime.worldBoundsUsingLocalBoundsID = 1;
    invalidateNodeWorldBounds(node);
    expect(runtime.worldBoundsUsingWorldTransformID).toBe(-1);
    expect(runtime.worldBoundsUsingLocalBoundsID).toBe(-1);
  });
});

type TestNode = Node;

const TestKind: unique symbol = Symbol('Test');
