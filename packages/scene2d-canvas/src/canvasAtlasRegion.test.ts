import { createTextureAtlasRegion } from '@flighthq/textureatlas/contract';
import { TextureAtlasRotation } from '@flighthq/types/contract';

import { drawCanvasAtlasRegion } from './canvasAtlasRegion';

function makeDrawHarness(rotation: TextureAtlasRotation) {
  const source = document.createElement('canvas');
  source.width = 20;
  source.height = 40;
  const context = document.createElement('canvas').getContext('2d')!;
  const region = createTextureAtlasRegion({ x: 0, y: 0, width: 20, height: 40, rotation });
  return { source, context, region };
}

describe('drawCanvasAtlasRegion', () => {
  it('keeps an unrotated region on the one-draw fast path', () => {
    const { source, context, region } = makeDrawHarness(TextureAtlasRotation.None);
    const draw = vi.spyOn(context, 'drawImage');
    const transform = vi.spyOn(context, 'transform');

    drawCanvasAtlasRegion(context, source, region, 5, 10, 40, 20);

    expect(draw).toHaveBeenCalledOnce();
    expect(draw).toHaveBeenCalledWith(source, 0, 0, 20, 40, 5, 10, 40, 20);
    expect(transform).not.toHaveBeenCalled();
  });

  it('draws a clockwise-packed region upright without a scratch surface', () => {
    const { source, context, region } = makeDrawHarness(TextureAtlasRotation.Clockwise90);
    const draw = vi.spyOn(context, 'drawImage');
    const transform = vi.spyOn(context, 'transform');
    const createElement = vi.spyOn(document, 'createElement');

    drawCanvasAtlasRegion(context, source, region, 0, 0, 40, 20);

    expect(draw).toHaveBeenCalledOnce();
    expect(transform).toHaveBeenCalledWith(0, -1, 1, 0, 0, 20);
    expect(createElement).not.toHaveBeenCalled();
  });

  it('draws a counterclockwise-packed region upright', () => {
    const { source, context, region } = makeDrawHarness(TextureAtlasRotation.Counterclockwise90);
    const transform = vi.spyOn(context, 'transform');

    drawCanvasAtlasRegion(context, source, region, 0, 0, 40, 20);

    expect(transform).toHaveBeenCalledWith(0, 1, -1, 0, 40, 0);
  });
});
