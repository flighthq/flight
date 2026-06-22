import { createNode, getNodeRuntime } from '@flighthq/node';
import type { Node, NodeRuntime } from '@flighthq/types';

import {
  computeNodeWorldTransformRevision,
  getNodeAppearanceRevision,
  getNodeLocalBoundsRevision,
  getNodeLocalContentRevision,
  getNodeLocalTransformRevision,
  getNodeWorldTransformRevision,
  invalidateNode,
  invalidateNodeAppearance,
  invalidateNodeLocalBounds,
  invalidateNodeLocalContent,
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
  it('updates worldTransformId based on local and parent transform IDs', () => {
    const runtime = getEntityRuntime(node);
    runtime.localTransformId = 3;
    computeNodeWorldTransformRevision(runtime);
    expect(runtime.worldTransformUsingLocalTransformId).toBe(3);
    expect(runtime.worldTransformUsingParentTransformId).toBe(0);
  });

  it('incorporates parent worldTransformId when provided', () => {
    const parentNode = createTestNode();
    const parentRuntime = getEntityRuntime(parentNode);
    parentRuntime.worldTransformId = 7;
    const runtime = getEntityRuntime(node);
    computeNodeWorldTransformRevision(runtime, parentRuntime);
    expect(runtime.worldTransformUsingParentTransformId).toBe(7);
  });
});

describe('getNodeAppearanceRevision', () => {
  it('returns appearanceId', () => {
    const runtime = getEntityRuntime(node);
    runtime.appearanceId = 100;
    expect(getNodeAppearanceRevision(node)).toStrictEqual(runtime.appearanceId);
  });
});

describe('getNodeLocalBoundsRevision', () => {
  it('returns localBoundsId', () => {
    const runtime = getEntityRuntime(node);
    runtime.localBoundsId = 100;
    expect(getNodeLocalBoundsRevision(node)).toStrictEqual(runtime.localBoundsId);
  });
});

describe('getNodeLocalContentRevision', () => {
  it('returns localContentId', () => {
    const runtime = getEntityRuntime(node);
    runtime.localContentId = 100;
    expect(getNodeLocalContentRevision(node)).toStrictEqual(runtime.localContentId);
  });
});

describe('getNodeLocalTransformRevision', () => {
  it('returns localTransformId', () => {
    const runtime = getEntityRuntime(node);
    runtime.localTransformId = 100;
    expect(getNodeLocalTransformRevision(node)).toStrictEqual(runtime.localTransformId);
  });
});

describe('getNodeWorldTransformRevision', () => {
  it('returns worldTransformId', () => {
    const runtime = getEntityRuntime(node);
    runtime.worldTransformId = 100;
    expect(getNodeWorldTransformRevision(node)).toStrictEqual(runtime.worldTransformId);
  });
});

describe('invalidateNode', () => {
  it('increments appearanceId, localBoundsId, localContentId, localTransformId', () => {
    const appearanceId = getEntityRuntime(node).appearanceId;
    const localBoundsId = getEntityRuntime(node).localBoundsId;
    const localContentId = getEntityRuntime(node).localContentId;
    const localTransformId = getEntityRuntime(node).localTransformId;
    invalidateNode(node);
    expect(getEntityRuntime(node).appearanceId).toBe(appearanceId + 1);
    expect(getEntityRuntime(node).localBoundsId).toBe(localBoundsId + 1);
    expect(getEntityRuntime(node).localContentId).toBe(localContentId + 1);
    expect(getEntityRuntime(node).localTransformId).toBe(localTransformId + 1);
  });

  it('invalidates parent reference', () => {
    invalidateNode(node);
    expect(getEntityRuntime(node).worldTransformUsingParentTransformId).toBe(-1);
  });

  it('invalidates world bounds', () => {
    invalidateNode(node);
    expect(getEntityRuntime(node).worldBoundsUsingWorldTransformId).toBe(-1);
    expect(getEntityRuntime(node).worldBoundsUsingLocalBoundsId).toBe(-1);
  });
});

describe('invalidateNodeAppearance', () => {
  it('increments appearanceId', () => {
    const appearanceId = getEntityRuntime(node).appearanceId;
    invalidateNodeAppearance(node);
    expect(getEntityRuntime(node).appearanceId).toBe(appearanceId + 1);
  });

  it('should wrap around appearanceId correctly using >>> 0', () => {
    const runtime = getEntityRuntime(node);
    runtime.appearanceId = 0xffffffff; // max 32-bit uint
    invalidateNodeAppearance(node);
    expect(getEntityRuntime(node).appearanceId).toBe(0);
  });
});

describe('invalidateNodeLocalBounds', () => {
  it('increments localBoundsId', () => {
    const localBoundsId = getEntityRuntime(node).localBoundsId;
    invalidateNodeLocalBounds(node);
    expect(getEntityRuntime(node).localBoundsId).toBe(localBoundsId + 1);
  });

  it('should wrap around localBoundsId correctly using >>> 0', () => {
    const runtime = getEntityRuntime(node);
    runtime.localBoundsId = 0xffffffff; // max 32-bit uint
    invalidateNodeLocalBounds(node);
    expect(getEntityRuntime(node).localBoundsId).toBe(0);
  });
});

describe('invalidateNodeLocalContent', () => {
  it('increments localContentId', () => {
    const localContentId = getEntityRuntime(node).localContentId;
    invalidateNodeLocalContent(node);
    expect(getEntityRuntime(node).localContentId).toBe(localContentId + 1);
  });

  it('should wrap around localContentId correctly using >>> 0', () => {
    const runtime = getEntityRuntime(node);
    runtime.localContentId = 0xffffffff; // max 32-bit uint
    invalidateNodeLocalContent(node);
    expect(getEntityRuntime(node).localContentId).toBe(0);
  });
});

describe('invalidateNodeLocalTransform', () => {
  it('increments localTransformId', () => {
    const localTransformId = getEntityRuntime(node).localTransformId;
    invalidateNodeLocalTransform(node);
    expect(getEntityRuntime(node).localTransformId).toBe(localTransformId + 1);
  });

  it('should wrap around localTransformId correctly using >>> 0', () => {
    const runtime = getEntityRuntime(node);
    runtime.localTransformId = 0xffffffff; // max 32-bit uint
    invalidateNodeLocalTransform(node);
    expect(getEntityRuntime(node).localTransformId).toBe(0);
  });
});

describe('invalidateNodeParentReference', () => {
  it('invalidates the world transform parent transform cached ID', () => {
    const runtime = getEntityRuntime(node);
    runtime.worldTransformUsingParentTransformId = 1;
    invalidateNodeParentReference(node);
    expect(runtime.worldTransformUsingParentTransformId).toBe(-1);
  });
});

describe('invalidateNodeRender', () => {
  it('increments both appearanceId and localTransformId', () => {
    const runtime = getEntityRuntime(node);
    const prevAppearance = runtime.appearanceId;
    const prevLocalTransform = runtime.localTransformId;
    invalidateNodeRender(node);
    expect(runtime.appearanceId).toBe(prevAppearance + 1);
    expect(runtime.localTransformId).toBe(prevLocalTransform + 1);
  });
});

describe('invalidateNodeWorldBounds', () => {
  it('invalidates supporting values for world bounds calculations', () => {
    const runtime = getEntityRuntime(node);
    runtime.worldBoundsUsingWorldTransformId = 1;
    runtime.worldBoundsUsingLocalBoundsId = 1;
    invalidateNodeWorldBounds(node);
    expect(runtime.worldBoundsUsingWorldTransformId).toBe(-1);
    expect(runtime.worldBoundsUsingLocalBoundsId).toBe(-1);
  });
});

type TestNode = Node;

const TestKind: unique symbol = Symbol('Test');
