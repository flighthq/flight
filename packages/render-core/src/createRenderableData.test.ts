import { matrix3x2 } from '@flighthq/geom';
import { colorTransform } from '@flighthq/materials';
import { BlendMode, type Renderable, type RenderableData } from '@flighthq/types';

import { createRenderableData } from './createRenderableData';

describe('createRenderableData', () => {
  let data: RenderableData;
  let source: Renderable = {} as Renderable;

  beforeEach(() => {
    data = createRenderableData(source);
  });

  it('initializes default values', () => {
    expect(data.alpha).toStrictEqual(1);
    expect(data.appearanceFrameID).toStrictEqual(-1);
    expect(data.blendMode).toStrictEqual(BlendMode.Normal);
    expect(data.cacheBitmap).toBeNull();
    expect(data.cacheAsBitmap).toStrictEqual(false);
    expect(data.colorTransform).toStrictEqual(colorTransform.create());
    expect(data.isMaskFrameID).toStrictEqual(-1);
    expect(data.lastAppearanceID).toStrictEqual(-1);
    expect(data.lastLocalTransformID).toStrictEqual(-1);
    expect(data.maskDepth).toStrictEqual(0);
    expect(data.scrollRectDepth).toStrictEqual(0);
    expect(data.shader).toStrictEqual(null);
    expect(data.source).toStrictEqual(source);
    expect(data.transform).toStrictEqual(matrix3x2.create());
    expect(data.transformFrameID).toStrictEqual(-1);
    expect(data.useColorTransform).toStrictEqual(false);
    expect(data.visible).toStrictEqual(true);
  });
});
