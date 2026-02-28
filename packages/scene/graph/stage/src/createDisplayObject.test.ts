import { matrix3x2 } from '@flighthq/geometry';
import type { DisplayObject } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';

describe('createDisplayObject', () => {
  let displayObject: DisplayObject;

  beforeEach(() => {
    displayObject = createDisplayObject();
  });

  it('initializes default values', () => {
    expect(displayObject.alpha).toBe(1);
    expect(displayObject.blendMode).toBe(BlendMode.Normal);
    expect(displayObject.cacheAsBitmap).toBe(false);
    expect(displayObject.cacheAsBitmapMatrix).toBeNull();
    expect(displayObject.filters).toBeNull();
    expect(displayObject.mask).toBeNull();
    expect(displayObject.name).toBeNull();
    expect(displayObject.opaqueBackground).toBeNull();
    expect(displayObject.parent).toBeNull();
    expect(displayObject.rotation).toBe(0);
    expect(displayObject.scaleX).toBe(1);
    expect(displayObject.scaleY).toBe(1);
    expect(displayObject.scale9Grid).toBeNull();
    expect(displayObject.shader).toBeNull();
    expect(displayObject.stage).toBeNull();
    expect(displayObject.visible).toBe(true);
    expect(displayObject.x).toBe(0);
    expect(displayObject.y).toBe(0);
  });

  it('allows pre-defined values', () => {
    const base = {
      alpha: 2,
      blendMode: BlendMode.Darken,
      cacheAsBitmap: true,
      cacheAsBitmapMatrix: matrix3x2.create(),
      filters: [],
      mask: createDisplayObject(),
      name: 'foo',
      opaqueBackground: 0xff0000,
      rotation: 45,
      scaleX: 2,
      scaleY: 3,
      shader: {},
      visible: false,
      x: 100,
      y: 200,
    };
    const obj = createDisplayObject(base);
    expect(obj.alpha).toStrictEqual(base.alpha);
    expect(obj.blendMode).toStrictEqual(base.blendMode);
    expect(obj.cacheAsBitmap).toStrictEqual(base.cacheAsBitmap);
    expect(obj.cacheAsBitmapMatrix).toStrictEqual(base.cacheAsBitmapMatrix);
    expect(obj.filters).toStrictEqual(base.filters);
    expect(obj.mask).toStrictEqual(base.mask);
    expect(obj.name).toStrictEqual(base.name);
    expect(obj.opaqueBackground).toStrictEqual(base.opaqueBackground);
    expect(obj.rotation).toStrictEqual(base.rotation);
    expect(obj.scaleX).toStrictEqual(base.scaleX);
    expect(obj.scaleY).toStrictEqual(base.scaleY);
    expect(obj.shader).toStrictEqual(base.shader);
    expect(obj.visible).toStrictEqual(base.visible);
    expect(obj.x).toStrictEqual(base.x);
    expect(obj.y).toStrictEqual(base.y);
    expect(obj.type).toStrictEqual('container');
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createDisplayObject(base);
    expect(obj).not.toStrictEqual(base);
  });
});
