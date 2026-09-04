import { createColorMatrixAdjustment, createTintAdjustment } from '@flighthq/adjustments/contract';
import { createEntity, getEntityRuntime } from '@flighthq/entity/contract';
import {
  addNodeColorAdjustment,
  getNodeColorAdjustments,
  setNodeColorAdjustments,
  setNodeColorAdjustmentsTint,
} from '@flighthq/node/contract';
import type { BoundsNode, Node2D, Node2DData, Node2DRuntime, PartialNode, Rectangle } from '@flighthq/types/contract';
import { BlendMode, DisplayObjectKind, Node2DTraitsKey } from '@flighthq/types/contract';

import {
  createDisplayObject,
  createNode2D,
  createNode2DRuntime,
  getNode2DRuntime,
  isNode2D,
  setNode2DClip,
} from './displayObject';

function getRuntime_(obj: Node2D): Node2DRuntime {
  return getEntityRuntime(obj) as Node2DRuntime;
}

describe('addNodeColorAdjustment', () => {
  let obj: Node2D;
  beforeEach(() => {
    obj = createDisplayObject();
  });

  it('appends to a fresh (null) stack and invalidates appearance', () => {
    const idBefore = getRuntime_(obj).appearanceId;
    const adjustment = { kind: 'ColorScaleBiasAdjustment' } as never;
    addNodeColorAdjustment(obj, adjustment);
    expect(getNodeColorAdjustments(obj)).toEqual([adjustment]);
    expect(getRuntime_(obj).appearanceId).not.toBe(idBefore);
  });

  it('appends to an existing stack without mutating the previous array', () => {
    const a = { kind: 'A' } as never;
    const b = { kind: 'B' } as never;
    addNodeColorAdjustment(obj, a);
    const first = getNodeColorAdjustments(obj);
    addNodeColorAdjustment(obj, b);
    expect(getNodeColorAdjustments(obj)).toEqual([a, b]);
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

describe('getNode2DRuntime', () => {
  it('returns the runtime for a Node2D', () => {
    const obj = createDisplayObject();
    const runtime = getNode2DRuntime(obj);
    expect(runtime).not.toBeNull();
  });
});

describe('getNodeColorAdjustments', () => {
  it('defaults to null on a fresh node', () => {
    expect(getNodeColorAdjustments(createDisplayObject())).toBeNull();
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
    const clip = createEntity({
      contours: null,
      rect: { x: 0, y: 0, width: 100, height: 50 } as Rectangle,
      winding: 'nonZero' as const,
      version: 0,
    });
    setNode2DClip(obj, clip);
    expect(obj.clip).toBe(clip);
  });

  it('accepts null', () => {
    setNode2DClip(obj, null);
    expect(obj.clip).toBeNull();
  });

  it('invalidates appearance', () => {
    const idBefore = getRuntime_(obj).appearanceId;
    setNode2DClip(
      obj,
      createEntity({
        contours: null,
        rect: { x: 0, y: 0, width: 10, height: 10 } as Rectangle,
        winding: 'nonZero' as const,
        version: 0,
      }),
    );
    expect(getRuntime_(obj).appearanceId).not.toBe(idBefore);
  });
});

describe('setNodeColorAdjustments', () => {
  let obj: Node2D;
  beforeEach(() => {
    obj = createDisplayObject();
  });

  it('sets the stack and invalidates appearance', () => {
    const idBefore = getRuntime_(obj).appearanceId;
    const stack = [createTintAdjustment(0xffffffff)];
    setNodeColorAdjustments(obj, stack);
    expect(getNodeColorAdjustments(obj)).toBe(stack);
    expect(getRuntime_(obj).appearanceId).not.toBe(idBefore);
  });

  it('accepts null', () => {
    setNodeColorAdjustments(obj, [createTintAdjustment(0xffffffff)]);
    setNodeColorAdjustments(obj, null);
    expect(getNodeColorAdjustments(obj)).toBeNull();
  });

  it('caches a complete channel-mixing matrix without marking it unsupported', () => {
    const matrix = [1, 0.5, 0, 0, 0.1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    setNodeColorAdjustments(obj, [createColorMatrixAdjustment(matrix)]);
    expect(getNode2DRuntime(obj).resolvedColorMatrix).toEqual(matrix);
    expect(getNode2DRuntime(obj).colorAdjustmentsUnsupported).toBe(false);
  });
});

describe('setNodeColorAdjustmentsTint', () => {
  it('replaces the stack with one TintAdjustment built from the packed color', () => {
    const obj = createDisplayObject();
    setNodeColorAdjustmentsTint(obj, 0xff0000ff);
    const stack = getNodeColorAdjustments(obj);
    expect(stack?.length).toBe(1);
    expect(stack?.[0].kind).toBe('TintAdjustment');
  });

  it('replaces any prior adjustments rather than layering', () => {
    const obj = createDisplayObject();
    setNodeColorAdjustmentsTint(obj, 0xff0000ff);
    setNodeColorAdjustmentsTint(obj, 0x00ff00ff);
    const stack = getNodeColorAdjustments(obj);
    expect(stack?.length).toBe(1);
  });
});

interface Node2DTest extends Node2D {}

interface Node2DTestData extends Node2DData {
  foo: string;
}

function createNode2DTestData(data?: Partial<Node2DTestData>): Node2DTestData {
  return createEntity({
    foo: data?.foo ?? 'bar',
  });
}
