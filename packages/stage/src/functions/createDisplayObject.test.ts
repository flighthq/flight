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
});
