import { createImageResource } from '@flighthq/image/contract';
import { createTexture, setTextureUvFromPixelRect } from '@flighthq/texture/contract';

import { drawCanvasTextureView } from './canvasTextureView';

function makeTexture(width = 100, height = 50) {
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  return { source, texture: createTexture({ dimension: '2d', source: createImageResource(source) }) };
}

describe('drawCanvasTextureView', () => {
  it('keeps an ordinary window on the one-draw fast path', () => {
    const context = document.createElement('canvas').getContext('2d')!;
    const { source, texture } = makeTexture();
    setTextureUvFromPixelRect(texture, 10, 20, 30, 15);
    const draw = vi.spyOn(context, 'drawImage');
    const transform = vi.spyOn(context, 'transform');

    drawCanvasTextureView(context, source, texture, 60, 30);

    expect(draw).toHaveBeenCalledOnce();
    expect(draw).toHaveBeenCalledWith(source, 10, 20, 30, 15, 0, 0, 60, 30);
    expect(transform).not.toHaveBeenCalled();
  });

  it('draws a cardinally rotated view with one transform and no scratch surface', () => {
    const context = document.createElement('canvas').getContext('2d')!;
    const { source, texture } = makeTexture();
    texture.uvOffset.x = 0.1;
    texture.uvOffset.y = 0.4;
    texture.uvScale.x = 0.3;
    texture.uvScale.y = 0.2;
    texture.uvRotation = -Math.PI / 2;
    const draw = vi.spyOn(context, 'drawImage');
    const transform = vi.spyOn(context, 'transform');
    const createElement = vi.spyOn(document, 'createElement');

    drawCanvasTextureView(context, source, texture, 15, 20);

    expect(draw).toHaveBeenCalledOnce();
    expect(transform).toHaveBeenCalledOnce();
    expect(createElement).not.toHaveBeenCalled();
  });
});
