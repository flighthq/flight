import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';
import { VideoTextureSourceKind } from '@flighthq/types/contract';

import { createCanvasRenderState } from './canvasRenderState';
import { resolveCanvasTexture } from './canvasTextureResolver';
import { registerCanvasVideoTextureResolver } from './canvasVideoTextureResolver';

describe('registerCanvasVideoTextureResolver', () => {
  it('returns the host video source directly', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const source = document.createElement('video');
    const image = createImageResource(source);
    image.kind = VideoTextureSourceKind;
    const texture = createTexture({ storage: { dimension: '2d', image } });
    registerCanvasVideoTextureResolver(state);
    expect(resolveCanvasTexture(state, texture)).toBe(source);
  });
});
