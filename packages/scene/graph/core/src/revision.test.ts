import { createGraphNode, getGraphNodeRuntime } from '@flighthq/scene-graph-core';
import type { GraphNode, GraphNodeRuntime } from '@flighthq/types';

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

function getRuntime(source: TestNode) {
  return getGraphNodeRuntime(source) as GraphNodeRuntime<typeof TestGraph>;
}

describe('getAppearanceID', () => {
  it('returns appearanceID', () => {
    const runtime = getRuntime(node);
    runtime.appearanceID = 100;
    expect(getAppearanceID(node)).toStrictEqual(runtime.appearanceID);
  });
});

describe('getLocalBoundsID', () => {
  it('returns localBoundsID', () => {
    const runtime = getRuntime(node);
    runtime.localBoundsID = 100;
    expect(getLocalBoundsID(node)).toStrictEqual(runtime.localBoundsID);
  });
});

describe('getLocalTransformID', () => {
  it('returns localTransformID', () => {
    const runtime = getRuntime(node);
    runtime.localTransformID = 100;
    expect(getLocalTransformID(node)).toStrictEqual(runtime.localTransformID);
  });
});

describe('getWorldTransformID', () => {
  it('returns worldTransformID', () => {
    const runtime = getRuntime(node);
    runtime.worldTransformID = 100;
    expect(getWorldTransformID(node)).toStrictEqual(runtime.worldTransformID);
  });
});

describe('invalidate', () => {
  it('increments appearanceID, localBoundsID, localTransformID', () => {
    const appearanceID = getRuntime(node).appearanceID;
    const localBoundsID = getRuntime(node).localBoundsID;
    const localTransformID = getRuntime(node).localTransformID;
    invalidate(node);
    expect(getRuntime(node).appearanceID).toBe(appearanceID + 1);
    expect(getRuntime(node).localBoundsID).toBe(localBoundsID + 1);
    expect(getRuntime(node).localTransformID).toBe(localTransformID + 1);
  });

  it('invalidates parent reference', () => {
    invalidate(node);
    expect(getRuntime(node).worldTransformUsingParentTransformID).toBe(-1);
  });

  it('invalidates world bounds', () => {
    invalidate(node);
    expect(getRuntime(node).worldBoundsUsingWorldTransformID).toBe(-1);
    expect(getRuntime(node).worldBoundsUsingLocalBoundsID).toBe(-1);
  });
});

describe('invalidateAppearance', () => {
  it('increments appearanceID', () => {
    const appearanceID = getRuntime(node).appearanceID;
    invalidateAppearance(node);
    expect(getRuntime(node).appearanceID).toBe(appearanceID + 1);
  });

  it('should wrap around appearanceID correctly using >>> 0', () => {
    const runtime = getRuntime(node);
    runtime.appearanceID = 0xffffffff; // max 32-bit uint
    invalidateAppearance(node);
    expect(getRuntime(node).appearanceID).toBe(0);
  });
});

describe('invalidateLocalBounds', () => {
  it('increments localBoundsID', () => {
    const localBoundsID = getRuntime(node).localBoundsID;
    invalidateLocalBounds(node);
    expect(getRuntime(node).localBoundsID).toBe(localBoundsID + 1);
  });

  it('should wrap around localBoundsID correctly using >>> 0', () => {
    const runtime = getRuntime(node);
    runtime.localBoundsID = 0xffffffff; // max 32-bit uint
    invalidateLocalBounds(node);
    expect(getRuntime(node).localBoundsID).toBe(0);
  });
});

describe('invalidateLocalTransform', () => {
  it('increments localTransformID', () => {
    const localTransformID = getRuntime(node).localTransformID;
    invalidateLocalTransform(node);
    expect(getRuntime(node).localTransformID).toBe(localTransformID + 1);
  });

  it('should wrap around localTransformID correctly using >>> 0', () => {
    const runtime = getRuntime(node);
    runtime.localTransformID = 0xffffffff; // max 32-bit uint
    invalidateLocalTransform(node);
    expect(getRuntime(node).localTransformID).toBe(0);
  });
});

describe('invalidateParentReference', () => {
  it('invalidates the world transform parent transform cached ID', () => {
    const runtime = getRuntime(node);
    runtime.worldTransformUsingParentTransformID = 1;
    invalidateParentReference(node);
    expect(runtime.worldTransformUsingParentTransformID).toBe(-1);
  });
});

describe('invalidateWorldBounds', () => {
  it('invalidates supporting values for world bounds calculations', () => {
    const runtime = getRuntime(node);
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
