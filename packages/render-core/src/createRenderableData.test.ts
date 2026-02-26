import { matrix3x2 } from '@flighthq/math';
import type { Renderable, RenderableData } from '@flighthq/types';

import { createRenderableData } from './createRenderableData';

describe('createRenderableData', () => {
  let data: RenderableData;
  let source: Renderable = {} as Renderable;

  beforeEach(() => {
    data = createRenderableData(source);
  });

  it('initializes default values', () => {
    expect(data.source).toStrictEqual(source);
    expect(data.appearanceID).toStrictEqual(-1);
    expect(data.cacheAsBitmap).toStrictEqual(false);
    expect(data.dirty).toStrictEqual(false);
    expect(data.localBoundsID).toStrictEqual(-1);
    expect(data.mask).toStrictEqual(null);
    expect(data.renderAlpha).toStrictEqual(-1);
    expect(data.renderTransform).toStrictEqual(matrix3x2.create());
    expect(data.worldTransformID).toStrictEqual(-1);
  });
});
