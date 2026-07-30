import { createTexture } from '@flighthq/texture/contract';
import type { ImageResource } from '@flighthq/types/contract';

import { createCanvasRenderState } from './canvasRenderState';
import { registerCanvasTextureResolver } from './canvasTextureResolver';
import { explainCanvasTextureResolution } from './explainCanvasTextureResolution';

describe('explainCanvasTextureResolution', () => {
  it('distinguishes missing kinds, missing resolvers, and registered resolvers', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createTexture({
      storage: { dimension: '2d', image: { kind: 'acme.test' } as ImageResource },
    });

    expect(explainCanvasTextureResolution(state, createTexture())).toEqual({
      kind: null,
      status: 'missing-kind',
    });
    expect(explainCanvasTextureResolution(state, texture)).toEqual({
      kind: 'acme.test',
      status: 'missing-resolver',
    });

    registerCanvasTextureResolver(state, 'acme.test', () => null);
    expect(explainCanvasTextureResolution(state, texture)).toEqual({
      kind: 'acme.test',
      status: 'registered',
    });
  });
});
