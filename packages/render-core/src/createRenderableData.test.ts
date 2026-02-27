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
    expect(data.cacheAsBitmap).toStrictEqual(false);
    expect(data.clipRect).toStrictEqual(null);
    expect(data.colorTransform).toStrictEqual(colorTransform.create());
    expect(data.lastAppearanceID).toStrictEqual(-1);
    expect(data.lastLocalTransformID).toStrictEqual(-1);
    expect(data.mask).toStrictEqual(null);
    expect(data.maskFrameID).toStrictEqual(-1);
    expect(data.shader).toStrictEqual(null);
    expect(data.source).toStrictEqual(source);
    expect(data.transform).toStrictEqual(matrix3x2.create());
    expect(data.transformFrameID).toStrictEqual(-1);
    expect(data.useColorTransform).toStrictEqual(false);
    expect(data.visible).toStrictEqual(true);
  });
});
