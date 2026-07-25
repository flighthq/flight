import { getEntityRuntime } from '@flighthq/entity';
import { createColorTransform } from '@flighthq/materials';
import type { BoundsNode, Node2D, Node2DData, Node2DRuntime, PartialNode, Rectangle } from '@flighthq/types';
import { BlendMode, DisplayObjectKind, Node2DTraitsKey } from '@flighthq/types';

import {
  addNode2DColorAdjustment,
  createDisplayObject,
  createNode2D,
  createNode2DRuntime,
  getNode2DColorAdjustments,
  getNode2DRuntime,
  isNode2D,
  setNode2DClip,
  setNode2DColorAdjustments,
  setNode2DColorTransform,
} from './displayObject';

function getRuntime_(obj: Node2D): Node2DRuntime {
  return getEntityRuntime(obj) as Node2DRuntime;
}

describe('addNode2DColorAdjustment', () => {
  let obj: Node2D;
  beforeEach(() => {
    obj = createDisplayObject();
  });

  it('appends to a fresh (null) stack and invalidates appearance', () => {
    const idBefore = getRuntime_(obj).appearanceId;
    const adjustment = { kind: 'ColorTransformAdjustment' } as never;
    addNode2DColorAdjustment(obj, adjustment);
    expect(getNode2DColorAdjustments(obj)).toEqual([adjustment]);
    expect(getRuntime_(obj).appearanceId).not.toBe(idBefore);
  });

  it('appends to an existing stack without mutating the previous array', () => {
    const a = { kind: 'A' } as never;
    const b = { kind: 'B' } as never;
    addNode2DColorAdjustment(obj, a);
    const first = getNode2DColorAdjustments(obj);
    addNode2DColorAdjustment(obj, b);
    expect(getNode2DColorAdjustments(obj)).toEqual([a, b]);
    expect(first).toEqual([a]); // the earlier array was not mutated
  });
});

describe('createDisplayObject', () => {
  let displayObject: Node2D;

  beforeEach(() => {
    displayObject = createDisplayObject();
  });

  it('initializes default values', () => {
    expect(displayObject.alpha).toBe(1);
    expect(displayObject.blendMode).toBeNull();
    expect(displayObject.name).toBeNull();
    expect(displayObject.visible).toBe(true);
    expect(displayObject.kind).toBe(DisplayObjectKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      alpha: 2,
      blendMode: BlendMode.Darken,
      name: 'foo',
      rotation: 45,
      scaleX: 2,
      scaleY: 3,
      visible: false,
      x: 100,
      y: 200,
    };
    const obj = createDisplayObject(base);
    expect(obj.alpha).toStrictEqual(base.alpha);
    expect(obj.blendMode).toStrictEqual(base.blendMode);
    expect(obj.name).toStrictEqual(base.name);
    expect(obj.rotation).toStrictEqual(base.rotation);
    expect(obj.scaleX).toStrictEqual(base.scaleX);
    expect(obj.scaleY).toStrictEqual(base.scaleY);
    expect(obj.visible).toStrictEqual(base.visible);
    expect(obj.x).toStrictEqual(base.x);
    expect(obj.y).toStrictEqual(base.y);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createDisplayObject(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createNode2D', () => {
  it('allows creation of a type without a data field', () => {
    const displayObject = createNode2D(DisplayObjectKind);
    expect(displayObject).not.toBeNull();
  });

  it('allows a custom type', () => {
    const data: PartialNode<Node2DTest> = {
      x: 100,
    };
    const displayObject = createNode2D(DisplayObjectKind, data);
    expect(displayObject.x).toBe(data.x);
  });

  it('returns a new object', () => {
    const data: PartialNode<Node2DTest> = {};
    const displayObject = createNode2D(DisplayObjectKind, data);
    expect(displayObject).not.toStrictEqual(data);
  });

  it('allows use of a data initializer', () => {
    const data: PartialNode<Node2DTest> = {};
    const displayObject = createNode2D(DisplayObjectKind, data, createNode2DTestData);
    expect((displayObject.data as Node2DTestData).foo).toBe('bar');
  });
});

describe('createNode2DRuntime', () => {
  it('returns a graph runtime object', () => {
    const runtime = createNode2DRuntime();
    expect(runtime).not.toBeNull();
  });

  it('sets traits to Node2DTraitsKey', () => {
    const runtime = createNode2DRuntime();
    expect(runtime.traits).toBe(Node2DTraitsKey);
  });

  it('allows a custom bounds calculation', () => {
    const func = (_out: Rectangle, _source: Readonly<BoundsNode<any>>) => {};
    const runtime = createNode2DRuntime({ computeLocalBoundsRectangle: func });
    expect(runtime.computeLocalBoundsRectangle).toStrictEqual(func);
  });
});

describe('getNode2DColorAdjustments', () => {
  it('defaults to null on a fresh node', () => {
    expect(getNode2DColorAdjustments(createDisplayObject())).toBeNull();
  });
});

describe('getNode2DRuntime', () => {
  it('returns the runtime for a Node2D', () => {
    const obj = createDisplayObject();
    const runtime = getNode2DRuntime(obj);
    expect(runtime).not.toBeNull();
  });
});

describe('isNode2D', () => {
  it('returns true for display objects', () => {
    expect(isNode2D(createDisplayObject())).toBe(true);
  });
});

describe('setNode2DClip', () => {
  let obj: Node2D;
  beforeEach(() => {
    obj = createDisplayObject();
  });

  it('sets clip', () => {
    const clip = {
      contours: null,
      rect: { x: 0, y: 0, width: 100, height: 50 } as Rectangle,
      winding: 'nonZero' as const,
      version: 0,
    };
    setNode2DClip(obj, clip);
    expect(obj.clip).toBe(clip);
  });

  it('accepts null', () => {
    setNode2DClip(obj, null);
    expect(obj.clip).toBeNull();
  });

  it('invalidates appearance', () => {
    const idBefore = getRuntime_(obj).appearanceId;
    setNode2DClip(obj, {
      contours: null,
      rect: { x: 0, y: 0, width: 10, height: 10 } as Rectangle,
      winding: 'nonZero',
      version: 0,
    });
    expect(getRuntime_(obj).appearanceId).not.toBe(idBefore);
  });
});

describe('setNode2DColorAdjustments', () => {
  let obj: Node2D;
  beforeEach(() => {
    obj = createDisplayObject();
  });

  it('sets the stack and invalidates appearance', () => {
    const idBefore = getRuntime_(obj).appearanceId;
    const stack = [{ kind: 'ColorTransformAdjustment' }] as never;
    setNode2DColorAdjustments(obj, stack);
    expect(getNode2DColorAdjustments(obj)).toBe(stack);
    expect(getRuntime_(obj).appearanceId).not.toBe(idBefore);
  });

  it('accepts null', () => {
    setNode2DColorAdjustments(obj, [{ kind: 'ColorTransformAdjustment' }] as never);
    setNode2DColorAdjustments(obj, null);
    expect(getNode2DColorAdjustments(obj)).toBeNull();
  });
});

describe('setNode2DColorTransform', () => {
  it('wraps a color transform as one ColorTransformAdjustment on the stack', () => {
    const obj = createDisplayObject();
    setNode2DColorTransform(obj, createColorTransform({ redMultiplier: 0.5 }));
    const stack = getNode2DColorAdjustments(obj);
    expect(stack?.length).toBe(1);
    expect(stack?.[0].kind).toBe('ColorTransformAdjustment');
  });

  it('clears with null', () => {
    const obj = createDisplayObject();
    setNode2DColorTransform(obj, createColorTransform({ redMultiplier: 0.5 }));
    setNode2DColorTransform(obj, null);
    expect(getNode2DColorAdjustments(obj)).toBeNull();
  });
});

interface Node2DTest extends Node2D {}

interface Node2DTestData extends Node2DData {
  foo: string;
}

function createNode2DTestData(data?: Partial<Node2DTestData>): Node2DTestData {
  return {
    foo: data?.foo ?? 'bar',
  };
}
