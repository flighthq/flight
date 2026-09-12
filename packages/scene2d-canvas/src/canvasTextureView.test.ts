import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import { createTexture, setTextureUvFromPixelRect } from '@flighthq/texture/contract';

import { drawCanvasTextureView } from './canvasTextureView';

// drawCanvasTextureView reads the texture's backing size and draws nothing when it is zero, and a
// resource only knows its size once a host measures its handle. That dependency is declared here rather
// than inherited: run on its own, this file used to see a 0x0 source and assert against a drawImage that
// never happened, and only passed in the broad suite because another package's test file had registered
// a resolver first.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

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
