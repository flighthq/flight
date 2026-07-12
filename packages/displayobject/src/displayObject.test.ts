import { getEntityRuntime } from '@flighthq/entity';
import { createColorTransform } from '@flighthq/materials';
import type {
  BoundsNode,
  DisplayObject,
  DisplayObjectData,
  DisplayObjectRuntime,
  PartialNode,
  Rectangle,
} from '@flighthq/types';
import { BlendMode, DisplayObjectKind, DisplayObjectTraitsKey } from '@flighthq/types';

import {
  addDisplayObjectColorAdjustment,
  createDisplayObject,
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectColorAdjustments,
  getDisplayObjectRuntime,
  isDisplayObject,
  setDisplayObjectClip,
  setDisplayObjectColorAdjustments,
  setDisplayObjectColorTransform,
} from './displayObject';

function getRuntime_(obj: DisplayObject): DisplayObjectRuntime {
  return getEntityRuntime(obj) as DisplayObjectRuntime;
}

describe('addDisplayObjectColorAdjustment', () => {
  let obj: DisplayObject;
  beforeEach(() => {
    obj = createDisplayObject();
  });

  it('appends to a fresh (null) stack and invalidates appearance', () => {
    const idBefore = getRuntime_(obj).appearanceId;
    const adjustment = { kind: 'ColorTransformAdjustment' } as never;
    addDisplayObjectColorAdjustment(obj, adjustment);
    expect(getDisplayObjectColorAdjustments(obj)).toEqual([adjustment]);
    expect(getRuntime_(obj).appearanceId).not.toBe(idBefore);
  });

  it('appends to an existing stack without mutating the previous array', () => {
    const a = { kind: 'A' } as never;
    const b = { kind: 'B' } as never;
    addDisplayObjectColorAdjustment(obj, a);
    const first = getDisplayObjectColorAdjustments(obj);
    addDisplayObjectColorAdjustment(obj, b);
    expect(getDisplayObjectColorAdjustments(obj)).toEqual([a, b]);
    expect(first).toEqual([a]); // the earlier array was not mutated
  });
});

describe('createDisplayObject', () => {
  let displayObject: DisplayObject;

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

  it('sets traits to DisplayObjectTraitsKey', () => {
    const runtime = createDisplayObjectRuntime();
    expect(runtime.traits).toBe(DisplayObjectTraitsKey);
  });

  it('allows a custom bounds calculation', () => {
    const func = (_out: Rectangle, _source: Readonly<BoundsNode<any>>) => {};
    const runtime = createDisplayObjectRuntime({ computeLocalBoundsRectangle: func });
    expect(runtime.computeLocalBoundsRectangle).toStrictEqual(func);
  });
});

describe('getDisplayObjectColorAdjustments', () => {
  it('defaults to null on a fresh node', () => {
    expect(getDisplayObjectColorAdjustments(createDisplayObject())).toBeNull();
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
  it('returns true for display objects', () => {
    expect(isDisplayObject(createDisplayObject())).toBe(true);
  });
});

describe('setDisplayObjectClip', () => {
  let obj: DisplayObject;
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
    setDisplayObjectClip(obj, clip);
    expect(obj.clip).toBe(clip);
  });

  it('accepts null', () => {
    setDisplayObjectClip(obj, null);
    expect(obj.clip).toBeNull();
  });

  it('invalidates appearance', () => {
    const idBefore = getRuntime_(obj).appearanceId;
    setDisplayObjectClip(obj, {
      contours: null,
      rect: { x: 0, y: 0, width: 10, height: 10 } as Rectangle,
      winding: 'nonZero',
      version: 0,
    });
    expect(getRuntime_(obj).appearanceId).not.toBe(idBefore);
  });
});

describe('setDisplayObjectColorAdjustments', () => {
  let obj: DisplayObject;
  beforeEach(() => {
    obj = createDisplayObject();
  });

  it('sets the stack and invalidates appearance', () => {
    const idBefore = getRuntime_(obj).appearanceId;
    const stack = [{ kind: 'ColorTransformAdjustment' }] as never;
    setDisplayObjectColorAdjustments(obj, stack);
    expect(getDisplayObjectColorAdjustments(obj)).toBe(stack);
    expect(getRuntime_(obj).appearanceId).not.toBe(idBefore);
  });

  it('accepts null', () => {
    setDisplayObjectColorAdjustments(obj, [{ kind: 'ColorTransformAdjustment' }] as never);
    setDisplayObjectColorAdjustments(obj, null);
    expect(getDisplayObjectColorAdjustments(obj)).toBeNull();
  });
});

describe('setDisplayObjectColorTransform', () => {
  it('wraps a color transform as one ColorTransformAdjustment on the stack', () => {
    const obj = createDisplayObject();
    setDisplayObjectColorTransform(obj, createColorTransform({ redMultiplier: 0.5 }));
    const stack = getDisplayObjectColorAdjustments(obj);
    expect(stack?.length).toBe(1);
    expect(stack?.[0].kind).toBe('ColorTransformAdjustment');
  });

  it('clears with null', () => {
    const obj = createDisplayObject();
    setDisplayObjectColorTransform(obj, createColorTransform({ redMultiplier: 0.5 }));
    setDisplayObjectColorTransform(obj, null);
    expect(getDisplayObjectColorAdjustments(obj)).toBeNull();
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
