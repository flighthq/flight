import { createClearcoatPbrExtension, createExtendedPbrMaterial } from '@flighthq/materials/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Texture } from '@flighthq/types/contract';

import { registerClearcoatPbrScene3DMaterialTextures } from './clearcoatPbrScene3DMaterialTextures';
import {
  createScene3DMaterialTextureRegistry,
  getScene3DMaterialTextures,
  registerExtendedPbrScene3DMaterialTextures,
} from './sceneMaterialTextureRegistry';

describe('registerClearcoatPbrScene3DMaterialTextures', () => {
  it('lists all clearcoat maps in descriptor order', () => {
    const registry = createScene3DMaterialTextureRegistry();
    registerExtendedPbrScene3DMaterialTextures(registry);
    registerClearcoatPbrScene3DMaterialTextures(registry);
    const factor = createTexture();
    const normal = createTexture();
    const roughness = createTexture();
    const out: Texture[] = [];
    getScene3DMaterialTextures(
      registry,
      createExtendedPbrMaterial({
        extensions: [
          createClearcoatPbrExtension({
            clearcoatMap: factor,
            clearcoatNormalMap: normal,
            clearcoatRoughnessMap: roughness,
          }),
        ],
      }),
      out,
    );
    expect(out).toEqual([factor, normal, roughness]);
  });
});
