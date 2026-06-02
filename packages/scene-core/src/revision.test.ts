import { createSceneNode, getSceneNodeRuntime } from '@flighthq/scene-core';
import type { SceneNode, SceneNodeRuntime } from '@flighthq/types';

import {
  getAppearanceRevision,
  getLocalBoundsRevision,
  getLocalTransformRevision,
  getWorldTransformRevision,
  invalidateAppearance,
  invalidateLocalBounds,
  invalidateLocalTransform,
  invalidateParentReference,
  invalidateRender,
  invalidateSceneNode,
  invalidateWorldBounds,
  recomputeWorldTransformRevision,
} from './revision';

function createTestNode(): TestNode {
  return createSceneNode(TestGraph, TestKind) as TestNode;
}

let node: TestNode;
beforeEach(() => {
  node = createTestNode();
});

function getEntityRuntime(source: TestNode) {
  return getSceneNodeRuntime(source) as SceneNodeRuntime<typeof TestGraph>;
}

describe('getAppearanceRevision', () => {
  it('returns appearanceID', () => {
    const runtime = getEntityRuntime(node);
    runtime.appearanceID = 100;
    expect(getAppearanceRevision(node)).toStrictEqual(runtime.appearanceID);
  });
});

describe('getLocalBoundsRevision', () => {
  it('returns localBoundsID', () => {
    const runtime = getEntityRuntime(node);
    runtime.localBoundsID = 100;
    expect(getLocalBoundsRevision(node)).toStrictEqual(runtime.localBoundsID);
  });
});

describe('getLocalTransformRevision', () => {
  it('returns localTransformID', () => {
    const runtime = getEntityRuntime(node);
    runtime.localTransformID = 100;
    expect(getLocalTransformRevision(node)).toStrictEqual(runtime.localTransformID);
  });
});

describe('getWorldTransformRevision', () => {
  it('returns worldTransformID', () => {
    const runtime = getEntityRuntime(node);
    runtime.worldTransformID = 100;
    expect(getWorldTransformRevision(node)).toStrictEqual(runtime.worldTransformID);
  });
});

describe('invalidateAppearance', () => {
  it('increments appearanceID', () => {
    const appearanceID = getEntityRuntime(node).appearanceID;
    invalidateAppearance(node);
    expect(getEntityRuntime(node).appearanceID).toBe(appearanceID + 1);
  });

  it('should wrap around appearanceID correctly using >>> 0', () => {
    const runtime = getEntityRuntime(node);
    runtime.appearanceID = 0xffffffff; // max 32-bit uint
    invalidateAppearance(node);
    expect(getEntityRuntime(node).appearanceID).toBe(0);
  });
});

describe('invalidateLocalBounds', () => {
  it('increments localBoundsID', () => {
    const localBoundsID = getEntityRuntime(node).localBoundsID;
    invalidateLocalBounds(node);
    expect(getEntityRuntime(node).localBoundsID).toBe(localBoundsID + 1);
  });

  it('should wrap around localBoundsID correctly using >>> 0', () => {
    const runtime = getEntityRuntime(node);
    runtime.localBoundsID = 0xffffffff; // max 32-bit uint
    invalidateLocalBounds(node);
    expect(getEntityRuntime(node).localBoundsID).toBe(0);
  });
});

describe('invalidateLocalTransform', () => {
  it('increments localTransformID', () => {
    const localTransformID = getEntityRuntime(node).localTransformID;
    invalidateLocalTransform(node);
    expect(getEntityRuntime(node).localTransformID).toBe(localTransformID + 1);
  });

  it('should wrap around localTransformID correctly using >>> 0', () => {
    const runtime = getEntityRuntime(node);
    runtime.localTransformID = 0xffffffff; // max 32-bit uint
    invalidateLocalTransform(node);
    expect(getEntityRuntime(node).localTransformID).toBe(0);
  });
});

describe('invalidateParentReference', () => {
  it('invalidates the world transform parent transform cached ID', () => {
    const runtime = getEntityRuntime(node);
    runtime.worldTransformUsingParentTransformID = 1;
    invalidateParentReference(node);
    expect(runtime.worldTransformUsingParentTransformID).toBe(-1);
  });
});

describe('invalidateRender', () => {
  it('increments both appearanceID and localTransformID', () => {
    const runtime = getEntityRuntime(node);
    const prevAppearance = runtime.appearanceID;
    const prevLocalTransform = runtime.localTransformID;
    invalidateRender(node);
    expect(runtime.appearanceID).toBe(prevAppearance + 1);
    expect(runtime.localTransformID).toBe(prevLocalTransform + 1);
  });
});

describe('invalidateSceneNode', () => {
  it('increments appearanceID, localBoundsID, localTransformID', () => {
    const appearanceID = getEntityRuntime(node).appearanceID;
    const localBoundsID = getEntityRuntime(node).localBoundsID;
    const localTransformID = getEntityRuntime(node).localTransformID;
    invalidateSceneNode(node);
    expect(getEntityRuntime(node).appearanceID).toBe(appearanceID + 1);
    expect(getEntityRuntime(node).localBoundsID).toBe(localBoundsID + 1);
    expect(getEntityRuntime(node).localTransformID).toBe(localTransformID + 1);
  });

  it('invalidates parent reference', () => {
    invalidateSceneNode(node);
    expect(getEntityRuntime(node).worldTransformUsingParentTransformID).toBe(-1);
  });

  it('invalidates world bounds', () => {
    invalidateSceneNode(node);
    expect(getEntityRuntime(node).worldBoundsUsingWorldTransformID).toBe(-1);
    expect(getEntityRuntime(node).worldBoundsUsingLocalBoundsID).toBe(-1);
  });
});

describe('invalidateWorldBounds', () => {
  it('invalidates supporting values for world bounds calculations', () => {
    const runtime = getEntityRuntime(node);
    runtime.worldBoundsUsingWorldTransformID = 1;
    runtime.worldBoundsUsingLocalBoundsID = 1;
    invalidateWorldBounds(node);
    expect(runtime.worldBoundsUsingWorldTransformID).toBe(-1);
    expect(runtime.worldBoundsUsingLocalBoundsID).toBe(-1);
  });
});

describe('recomputeWorldTransformRevision', () => {
  it('updates worldTransformID based on local and parent transform IDs', () => {
    const runtime = getEntityRuntime(node);
    runtime.localTransformID = 3;
    recomputeWorldTransformRevision(runtime);
    expect(runtime.worldTransformUsingLocalTransformID).toBe(3);
    expect(runtime.worldTransformUsingParentTransformID).toBe(0);
  });

  it('incorporates parent worldTransformID when provided', () => {
    const parentNode = createTestNode();
    const parentRuntime = getEntityRuntime(parentNode);
    parentRuntime.worldTransformID = 7;
    const runtime = getEntityRuntime(node);
    recomputeWorldTransformRevision(runtime, parentRuntime);
    expect(runtime.worldTransformUsingParentTransformID).toBe(7);
  });
});

type TestNode = SceneNode<typeof TestGraph>;

const TestGraph: unique symbol = Symbol('TestGraph');

const TestKind: unique symbol = Symbol('Test');
