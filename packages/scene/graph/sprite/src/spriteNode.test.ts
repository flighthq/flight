import { createGraphNode } from '@flighthq/scene-graph-core';
import type { GraphNode, PartialNode, Rectangle, Shader, SpriteNode, SpriteNodeData } from '@flighthq/types';
import { BlendMode, DisplayObjectKind, SpriteGraph } from '@flighthq/types';

import { createSpriteNode, createSpriteNodeRuntime, getSpriteNodeRuntime } from './spriteNode';
import { isSpriteNode } from './spriteNode';

describe('createSpriteNode', () => {
  let spriteNode: SpriteNode;

  beforeEach(() => {
    spriteNode = createSpriteNode(SpriteNodeTestKind);
  });

  it('initializes default values', () => {
    expect(spriteNode.alpha).toBe(1);
    expect(spriteNode.blendMode).toBe(BlendMode.Normal);
    expect(spriteNode.shader).toBeNull();
    expect(spriteNode.visible).toBe(true);
    expect(spriteNode.kind).toBe(SpriteNodeTestKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      alpha: 2,
      blendMode: BlendMode.Darken,
      name: 'foo',
      rotation: 45,
      scaleX: 2,
      scaleY: 3,
      shader: {} as Shader,
      visible: false,
      x: 100,
      y: 200,
    };
    const obj = createSpriteNode(SpriteNodeTestKind, base);
    expect(obj.alpha).toStrictEqual(base.alpha);
    expect(obj.blendMode).toStrictEqual(base.blendMode);
    expect(obj.name).toStrictEqual(base.name);
    expect(obj.rotation).toStrictEqual(base.rotation);
    expect(obj.scaleX).toStrictEqual(base.scaleX);
    expect(obj.scaleY).toStrictEqual(base.scaleY);
    expect(obj.shader).toStrictEqual(base.shader);
    expect(obj.visible).toStrictEqual(base.visible);
    expect(obj.x).toStrictEqual(base.x);
    expect(obj.y).toStrictEqual(base.y);
  });

  it('uses SpriteGraph for runtime.graph', () => {
    const runtime = getSpriteNodeRuntime(spriteNode);
    expect(runtime.graph).toStrictEqual(SpriteGraph);
  });

  it('allows creation of a type without a data field', () => {
    const spriteNode = createSpriteNode(SpriteNodeTestKind);
    expect(spriteNode).not.toBeNull();
  });

  it('allows a custom type', () => {
    const data: PartialNode<SpriteNodeTest> = {
      x: 100,
    };
    const spriteNode = createSpriteNode(SpriteNodeTestKind, data);
    expect(spriteNode.x).toBe(data.x);
  });

  it('returns a new object', () => {
    const data: PartialNode<SpriteNodeTest> = {};
    const spriteNode = createSpriteNode(SpriteNodeTestKind, data);
    expect(spriteNode).not.toStrictEqual(data);
  });

  it('allows use of a data initializer', () => {
    const data: PartialNode<SpriteNodeTest> = {};
    const spriteNode = createSpriteNode(DisplayObjectKind, data, createSpriteNodeTestData);
    expect((spriteNode.data as SpriteNodeTestData).foo).toBe('bar');
  });
});

describe('createSpriteNodeRuntime', () => {
  it('returns a graph runtime object', () => {
    const runtime = createSpriteNodeRuntime();
    expect(runtime).not.toBeNull();
  });

  it('allows a custom bounds calculation', () => {
    const func = (_out: Rectangle, _source: Readonly<GraphNode>) => {};
    const runtime = createSpriteNodeRuntime({ computeLocalBoundsRect: func });
    expect(runtime.computeLocalBoundsRect).toStrictEqual(func);
  });
});

describe('isSpriteNode', () => {
  it('returns true for a sprite node', () => {
    const node = createSpriteNode(SpriteNodeTestKind);
    expect(isSpriteNode(node)).toBe(true);
  });

  it('returns false for a different graph type', () => {
    const TestGraph: unique symbol = Symbol('TestGraph');
    const node = createGraphNode(TestGraph, SpriteNodeTestKind);
    expect(isSpriteNode(node)).toBe(false);
  });
});

interface SpriteNodeTest extends SpriteNode {}

const SpriteNodeTestKind: unique symbol = Symbol('SpriteNodeTest');

interface SpriteNodeTestData extends SpriteNodeData {
  foo: string;
}

function createSpriteNodeTestData(data?: Partial<SpriteNodeTestData>): SpriteNodeTestData {
  return {
    foo: data?.foo ?? 'bar',
  };
}
