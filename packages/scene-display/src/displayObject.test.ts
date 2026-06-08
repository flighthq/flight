import { getEntityRuntime } from '@flighthq/entity';
import { createSceneNode } from '@flighthq/scene';
import type {
  DisplayObject,
  DisplayObjectData,
  DisplayObjectRuntime,
  PartialNode,
  Rectangle,
  SceneNode,
  Shader,
} from '@flighthq/types';
import { BlendMode, DisplayGraph, DisplayObjectKind } from '@flighthq/types';

import {
  createDisplayObject,
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectRuntime,
  isDisplayObject,
  setDisplayObjectMask,
} from './displayObject';

function getRuntime_(obj: DisplayObject): DisplayObjectRuntime {
  return getEntityRuntime(obj) as DisplayObjectRuntime;
}

describe('createDisplayObject', () => {
  let displayObject: DisplayObject;

  beforeEach(() => {
    displayObject = createDisplayObject();
  });

  it('initializes default values', () => {
    expect(displayObject.alpha).toBe(1);
    expect(displayObject.blendMode).toBeNull();
    expect(displayObject.mask).toBeNull();
    expect(displayObject.name).toBeNull();
    expect(displayObject.shader).toBeNull();
    expect(displayObject.visible).toBe(true);
    expect(displayObject.kind).toBe(DisplayObjectKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      alpha: 2,
      blendMode: BlendMode.Darken,
      mask: createDisplayObject(),
      name: 'foo',
      rotation: 45,
      scaleX: 2,
      scaleY: 3,
      shader: {} as Shader,
      visible: false,
      x: 100,
      y: 200,
    };
    const obj = createDisplayObject(base);
    expect(obj.alpha).toStrictEqual(base.alpha);
    expect(obj.blendMode).toStrictEqual(base.blendMode);
    expect(obj.mask).toStrictEqual(base.mask);
    expect(obj.name).toStrictEqual(base.name);
    expect(obj.rotation).toStrictEqual(base.rotation);
    expect(obj.scaleX).toStrictEqual(base.scaleX);
    expect(obj.scaleY).toStrictEqual(base.scaleY);
    expect(obj.shader).toStrictEqual(base.shader);
    expect(obj.visible).toStrictEqual(base.visible);
    expect(obj.x).toStrictEqual(base.x);
    expect(obj.y).toStrictEqual(base.y);
  });

  it('uses DisplayGraph for runtime.graph', () => {
    const runtime = getDisplayObjectRuntime(displayObject);
    expect(runtime.graph).toStrictEqual(DisplayGraph);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createDisplayObject(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createDisplayObjectGeneric', () => {
  it('allows creation of a type without a data field', () => {
    const displayObject = createDisplayObjectGeneric(DisplayObjectKind);
    expect(displayObject).not.toBeNull();
  });

  it('allows a custom type', () => {
    const data: PartialNode<DisplayObjectTest> = {
      x: 100,
    };
    const displayObject = createDisplayObjectGeneric(DisplayObjectKind, data);
    expect(displayObject.x).toBe(data.x);
  });

  it('returns a new object', () => {
    const data: PartialNode<DisplayObjectTest> = {};
    const displayObject = createDisplayObjectGeneric(DisplayObjectKind, data);
    expect(displayObject).not.toStrictEqual(data);
  });

  it('allows use of a data initializer', () => {
    const data: PartialNode<DisplayObjectTest> = {};
    const displayObject = createDisplayObjectGeneric(DisplayObjectKind, data, createDisplayObjectTestData);
    expect((displayObject.data as DisplayObjectTestData).foo).toBe('bar');
  });
});

describe('createDisplayObjectRuntime', () => {
  it('returns a graph runtime object', () => {
    const runtime = createDisplayObjectRuntime();
    expect(runtime).not.toBeNull();
  });

  it('allows a custom bounds calculation', () => {
    const func = (_out: Rectangle, _source: Readonly<SceneNode>) => {};
    const runtime = createDisplayObjectRuntime({ computeLocalBoundsRect: func });
    expect(runtime.computeLocalBoundsRect).toStrictEqual(func);
  });
});

describe('getDisplayObjectRuntime', () => {
  it('returns the runtime for a DisplayObject', () => {
    const obj = createDisplayObject();
    const runtime = getDisplayObjectRuntime(obj);
    expect(runtime).not.toBeNull();
  });
});

describe('isDisplayObject', () => {
  it('returns true for a sprite node', () => {
    const node = createDisplayObject();
    expect(isDisplayObject(node)).toBe(true);
  });

  it('returns false for a different graph type', () => {
    const TestGraph: unique symbol = Symbol('TestGraph');
    const node = createSceneNode(TestGraph, DisplayObjectKind);
    expect(isDisplayObject(node)).toBe(false);
  });
});

describe('setDisplayObjectMask', () => {
  let obj: DisplayObject;
  beforeEach(() => {
    obj = createDisplayObject();
  });

  it('sets mask', () => {
    const mask = createDisplayObject();
    setDisplayObjectMask(obj, mask);
    expect(obj.mask).toBe(mask);
  });

  it('accepts null', () => {
    setDisplayObjectMask(obj, null);
    expect(obj.mask).toBeNull();
  });

  it('invalidates appearance', () => {
    const idBefore = getRuntime_(obj).appearanceID;
    setDisplayObjectMask(obj, createDisplayObject());
    expect(getRuntime_(obj).appearanceID).not.toBe(idBefore);
  });
});

interface DisplayObjectTest extends DisplayObject {}

interface DisplayObjectTestData extends DisplayObjectData {
  foo: string;
}

function createDisplayObjectTestData(data?: Partial<DisplayObjectTestData>): DisplayObjectTestData {
  return {
    foo: data?.foo ?? 'bar',
  };
}
