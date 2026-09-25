import { createTexture } from '@flighthq/texture/contract';
import type { TextureSource } from '@flighthq/types/contract';

import { getCanvasRenderStateTextureResolvers } from './canvasTestSupport.ts';
import { createCanvasRenderState } from './canvasTestSupport.ts';
import { registerCanvasTextureResolver } from './canvasTestSupport.ts';
import { explainCanvasTextureResolution } from './explainCanvasTextureResolution.ts';

describe('explainCanvasTextureResolution', () => {
  it('distinguishes missing kinds, missing resolvers, and registered resolvers', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createTexture({
      dimension: '2d',
      source: {
        height: 1,
        kind: 'acme.test',
        version: 0,
        width: 1,
      } as unknown as TextureSource,
    });

    expect(explainCanvasTextureResolution(getCanvasRenderStateTextureResolvers(state), createTexture())).toEqual({
      kind: null,
      status: 'missing-kind',
    });
    expect(explainCanvasTextureResolution(getCanvasRenderStateTextureResolvers(state), texture)).toEqual({
      kind: 'acme.test',
      status: 'missing-resolver',
    });

    registerCanvasTextureResolver(getCanvasRenderStateTextureResolvers(state), 'acme.test', () => null);
    expect(explainCanvasTextureResolution(getCanvasRenderStateTextureResolvers(state), texture)).toEqual({
      kind: 'acme.test',
      status: 'registered',
    });
  });
});
