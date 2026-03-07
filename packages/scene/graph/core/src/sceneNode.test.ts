import type { PartialWithData } from '@flighthq/types';
import { type SceneNode, type SceneNodeData, SceneNodeKind, type SceneNodeRuntime } from '@flighthq/types';

import { createSceneNodeRuntime, getRuntime } from './runtime';
import { createSceneNode } from './sceneNode';

describe('createSceneNode', () => {
  it('allows creation of a type without a data field', () => {
    const sceneNode = createSceneNode(SceneNodeKind);
    expect(sceneNode.data).toBeNull();
  });

  it('makes a default runtime object if none passed in', () => {
    const sceneNode = createSceneNode(SceneNodeKind);
    const runtime = getRuntime(sceneNode);
    expect(runtime).not.toBeNull();
  });

  it('allows a custom type', () => {
    const data: PartialWithData<SceneNodeTest> = {
      visible: false,
    };
    const sceneNode = createSceneNode(SceneNodeTestKind, data);
    expect(sceneNode.visible).toBe(false);
  });

  it('returns a new object', () => {
    const data: PartialWithData<SceneNodeTest> = {};
    const sceneNode: SceneNodeTest = createSceneNode(SceneNodeTestKind, data);
    expect(sceneNode).not.toStrictEqual(data);
  });

  it('allows use of a data initializer', () => {
    const data: PartialWithData<SceneNodeTest> = {};
    const sceneNode: SceneNodeTest = createSceneNode(SceneNodeTestKind, data, createSceneNodeTestData);
    expect((sceneNode.data as SceneNodeTestData).foo).toBe('bar');
  });

  it('allows use of a runtime initializer', () => {
    const data: PartialWithData<SceneNodeTest> = {};
    const sceneNode = createSceneNode<typeof SceneNodeTestKind, SceneNodeTestData>(
      SceneNodeTestKind,
      data,
      undefined,
      createSceneNodeTestRuntime,
    );
    const runtime = getRuntime(sceneNode);
    expect((runtime as SceneNodeTestRuntime).foo).toBe('bar');
  });
});

const SceneNodeTestKind: unique symbol = Symbol('SceneNodeTest');

interface SceneNodeTest extends SceneNode<typeof SceneNodeTestKind> {}

interface SceneNodeTestData extends SceneNodeData {
  foo: string;
}

interface SceneNodeTestRuntime extends SceneNodeRuntime<typeof SceneNodeTestKind> {
  foo: string;
}

function createSceneNodeTestData(data?: Partial<SceneNodeTestData>): SceneNodeTestData {
  return {
    foo: data?.foo ?? 'bar',
  };
}

function createSceneNodeTestRuntime(): SceneNodeTestRuntime {
  const obj = createSceneNodeRuntime(SceneNodeTestKind) as SceneNodeTestRuntime;
  obj.foo = 'bar';
  return obj;
}
