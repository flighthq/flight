import { createGraphNode, getGraphNodeRuntime } from '@flighthq/scene-graph-core';
import type { GraphNode } from '@flighthq/types';

import {
  getAppearanceID,
  getLocalBoundsID,
  getLocalTransformID,
  getWorldTransformID,
  invalidate,
  invalidateAppearance,
  invalidateLocalBounds,
  invalidateLocalTransform,
  invalidateParentReference,
  invalidateWorldBounds,
} from './revision';

function createTestNode(): TestNode {
  return createGraphNode(TestGraph, TestKind) as TestNode;
}

let node: TestNode;
beforeEach(() => {
  node = createTestNode();
});

describe('getAppearanceID', () => {
  it('returns appearanceID', () => {
    const runtime = getGraphNodeRuntime(node);
    runtime.appearanceID = 100;
    expect(getAppearanceID(node)).toStrictEqual(runtime.appearanceID);
  });
});

describe('getLocalBoundsID', () => {
  it('returns localBoundsID', () => {
    const runtime = getGraphNodeRuntime(node);
    runtime.localBoundsID = 100;
    expect(getLocalBoundsID(node)).toStrictEqual(runtime.localBoundsID);
  });
});

describe('getLocalTransformID', () => {
  it('returns localTransformID', () => {
    const runtime = getGraphNodeRuntime(node);
    runtime.localTransformID = 100;
    expect(getLocalTransformID(node)).toStrictEqual(runtime.localTransformID);
  });
});

describe('getWorldTransformID', () => {
  it('returns worldTransformID', () => {
    const runtime = getGraphNodeRuntime(node);
    runtime.worldTransformID = 100;
    expect(getWorldTransformID(node)).toStrictEqual(runtime.worldTransformID);
  });
});

describe('invalidate', () => {
  it('increments appearanceID, localBoundsID, localTransformID', () => {
    const appearanceID = getGraphNodeRuntime(node).appearanceID;
    const localBoundsID = getGraphNodeRuntime(node).localBoundsID;
    const localTransformID = getGraphNodeRuntime(node).localTransformID;
    invalidate(node);
    expect(getGraphNodeRuntime(node).appearanceID).toBe(appearanceID + 1);
    expect(getGraphNodeRuntime(node).localBoundsID).toBe(localBoundsID + 1);
    expect(getGraphNodeRuntime(node).localTransformID).toBe(localTransformID + 1);
  });

  it('invalidates parent reference', () => {
    invalidate(node);
    expect(getGraphNodeRuntime(node).worldTransformUsingParentTransformID).toBe(-1);
  });

  it('invalidates world bounds', () => {
    invalidate(node);
    expect(getGraphNodeRuntime(node).worldBoundsUsingWorldTransformID).toBe(-1);
    expect(getGraphNodeRuntime(node).worldBoundsUsingLocalBoundsID).toBe(-1);
  });
});

describe('invalidateAppearance', () => {
  it('increments appearanceID', () => {
    const appearanceID = getGraphNodeRuntime(node).appearanceID;
    invalidateAppearance(node);
    expect(getGraphNodeRuntime(node).appearanceID).toBe(appearanceID + 1);
  });

  it('should wrap around appearanceID correctly using >>> 0', () => {
    const runtime = getGraphNodeRuntime(node);
    runtime.appearanceID = 0xffffffff; // max 32-bit uint
    invalidateAppearance(node);
    expect(getGraphNodeRuntime(node).appearanceID).toBe(0);
  });
});

describe('invalidateLocalBounds', () => {
  it('increments localBoundsID', () => {
    const localBoundsID = getGraphNodeRuntime(node).localBoundsID;
    invalidateLocalBounds(node);
    expect(getGraphNodeRuntime(node).localBoundsID).toBe(localBoundsID + 1);
  });

  it('should wrap around localBoundsID correctly using >>> 0', () => {
    const runtime = getGraphNodeRuntime(node);
    runtime.localBoundsID = 0xffffffff; // max 32-bit uint
    invalidateLocalBounds(node);
    expect(getGraphNodeRuntime(node).localBoundsID).toBe(0);
  });
});

describe('invalidateLocalTransform', () => {
  it('increments localTransformID', () => {
    const localTransformID = getGraphNodeRuntime(node).localTransformID;
    invalidateLocalTransform(node);
    expect(getGraphNodeRuntime(node).localTransformID).toBe(localTransformID + 1);
  });

  it('should wrap around localTransformID correctly using >>> 0', () => {
    const runtime = getGraphNodeRuntime(node);
    runtime.localTransformID = 0xffffffff; // max 32-bit uint
    invalidateLocalTransform(node);
    expect(getGraphNodeRuntime(node).localTransformID).toBe(0);
  });
});

describe('invalidateParentReference', () => {
  it('invalidates the world transform parent transform cached ID', () => {
    const runtime = getGraphNodeRuntime(node);
    runtime.worldTransformUsingParentTransformID = 1;
    invalidateParentReference(node);
    expect(runtime.worldTransformUsingParentTransformID).toBe(-1);
  });
});

describe('invalidateWorldBounds', () => {
  it('invalidates supporting values for world bounds calculations', () => {
    const runtime = getGraphNodeRuntime(node);
    runtime.worldBoundsUsingWorldTransformID = 1;
    runtime.worldBoundsUsingLocalBoundsID = 1;
    invalidateWorldBounds(node);
    expect(runtime.worldBoundsUsingWorldTransformID).toBe(-1);
    expect(runtime.worldBoundsUsingLocalBoundsID).toBe(-1);
  });
});

type TestNode = GraphNode<typeof TestGraph>;

const TestGraph: unique symbol = Symbol('TestGraph');

const TestKind: unique symbol = Symbol('Test');
