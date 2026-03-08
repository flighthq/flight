import { createSceneNode, createTransform2DRuntime, getRuntime as _getRuntime } from '@flighthq/scene-graph-core';
import type { SceneNode, Transform2D, Transform2DRuntime } from '@flighthq/types';

import {
  getLocalTransformID,
  getWorldTransformID,
  invalidateLocalTransform,
  invalidateWorldTransformParent,
} from './revision';

function createTestNode(): TestNode {
  const node: TestNode = createSceneNode(TestKind, undefined, undefined, createTransform2DRuntime) as TestNode;
  node.rotation = 0;
  node.scaleX = 1;
  node.scaleY = 1;
  node.x = 0;
  node.y = 0;
  return node;
}

function getRuntime(source: TestNode) {
  return _getRuntime(source) as Transform2DRuntime<typeof TestKind>;
}

let node: TestNode;
beforeEach(() => {
  node = createTestNode();
});

describe('getLocalTransformID', () => {
  it('returns localTransformID', () => {
    const state = getRuntime(node);
    state.localTransformID = 100;
    expect(getLocalTransformID(node)).toStrictEqual(state.localTransformID);
  });
});

describe('getWorldTransformID', () => {
  it('returns worldTransformID', () => {
    const state = getRuntime(node);
    state.worldTransformID = 100;
    expect(getWorldTransformID(node)).toStrictEqual(state.worldTransformID);
  });
});

describe('invalidateLocalTransform', () => {
  it('increments localTransformID', () => {
    const localTransformID = getRuntime(node).localTransformID;
    invalidateLocalTransform(node);
    expect(getRuntime(node).localTransformID).toBe(localTransformID + 1);
  });

  it('should wrap around localTransformID correctly using >>> 0', () => {
    const state = getRuntime(node);
    state.localTransformID = 0xffffffff; // max 32-bit uint
    invalidateLocalTransform(node);
    expect(getRuntime(node).localTransformID).toBe(0);
  });
});

describe('invalidateWorldTransformParent', () => {
  it('invalidates the world transform parent transform cached ID', () => {
    const state = getRuntime(node);
    state.worldTransformUsingParentTransformID = 1;
    invalidateWorldTransformParent(node);
    expect(state.worldTransformUsingParentTransformID).toBe(-1);
  });
});

interface TestNode extends SceneNode<typeof TestKind>, Transform2D {}

const TestKind: unique symbol = Symbol('Test');
