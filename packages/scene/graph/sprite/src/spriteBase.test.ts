import type { GraphNode, PartialNode, Rectangle, SpriteBase, SpriteBaseData } from '@flighthq/types';
import { BlendMode, DisplayObjectKind, SpriteGraph } from '@flighthq/types';

import { createSpriteBase, createSpriteBaseRuntime, getSpriteBaseRuntime } from './spriteBase';

describe('createSpriteBase', () => {
  let spriteBase: SpriteBase;

  beforeEach(() => {
    spriteBase = createSpriteBase(SpriteBaseTestKind);
  });

  it('initializes default values', () => {
    expect(spriteBase.alpha).toBe(1);
    expect(spriteBase.blendMode).toBe(BlendMode.Normal);
    expect(spriteBase.shader).toBeNull();
    expect(spriteBase.visible).toBe(true);
    expect(spriteBase.kind).toBe(SpriteBaseTestKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      alpha: 2,
      blendMode: BlendMode.Darken,
      name: 'foo',
      rotation: 45,
      scaleX: 2,
      scaleY: 3,
      shader: {},
      visible: false,
      x: 100,
      y: 200,
    };
    const obj = createSpriteBase(SpriteBaseTestKind, base);
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
    const runtime = getSpriteBaseRuntime(spriteBase);
    expect(runtime.graph).toStrictEqual(SpriteGraph);
  });

  it('allows creation of a type without a data field', () => {
    const spriteBase = createSpriteBase(SpriteBaseTestKind);
    expect(spriteBase).not.toBeNull();
  });

  it('allows a custom type', () => {
    const data: PartialNode<SpriteBaseTest> = {
      x: 100,
    };
    const spriteBase = createSpriteBase(SpriteBaseTestKind, data);
    expect(spriteBase.x).toBe(data.x);
  });

  it('returns a new object', () => {
    const data: PartialNode<SpriteBaseTest> = {};
    const spriteBase = createSpriteBase(SpriteBaseTestKind, data);
    expect(spriteBase).not.toStrictEqual(data);
  });

  it('allows use of a data initializer', () => {
    const data: PartialNode<SpriteBaseTest> = {};
    const spriteBase = createSpriteBase(DisplayObjectKind, data, createSpriteBaseTestData);
    expect((spriteBase.data as SpriteBaseTestData).foo).toBe('bar');
  });
});

describe('createSpriteBaseRuntime', () => {
  it('returns a graph runtime object', () => {
    const runtime = createSpriteBaseRuntime();
    expect(runtime).not.toBeNull();
  });

  it('allows a custom bounds calculation', () => {
    const func = (_out: Rectangle, _source: Readonly<GraphNode>) => {};
    const runtime = createSpriteBaseRuntime({ computeLocalBoundsRect: func });
    expect(runtime.computeLocalBoundsRect).toStrictEqual(func);
  });
});

interface SpriteBaseTest extends SpriteBase {}

const SpriteBaseTestKind: unique symbol = Symbol('SpriteBaseTest');

interface SpriteBaseTestData extends SpriteBaseData {
  foo: string;
}

function createSpriteBaseTestData(data?: Partial<SpriteBaseTestData>): SpriteBaseTestData {
  return {
    foo: data?.foo ?? 'bar',
  };
}
