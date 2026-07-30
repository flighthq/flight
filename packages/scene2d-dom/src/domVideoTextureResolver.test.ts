import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';
import { VideoTextureSourceKind } from '@flighthq/types/contract';

import { createDomRenderState } from './domRenderState';
import { resolveDomTexture } from './domTextureResolver';
import { registerDomVideoTextureResolver } from './domVideoTextureResolver';

describe('registerDomVideoTextureResolver', () => {
  it('returns the host video source directly', () => {
    const state = createDomRenderState(document.createElement('div'));
    const source = document.createElement('video');
    const image = createImageResource(source);
    image.kind = VideoTextureSourceKind;
    const texture = createTexture({ storage: { dimension: '2d', image } });
    registerDomVideoTextureResolver(state);
    expect(resolveDomTexture(state, texture)).toBe(source);
  });
});
