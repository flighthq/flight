import { createExtendedPbrMaterial, createSpecularPbrExtension } from '@flighthq/materials/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Texture } from '@flighthq/types/contract';

import {
  createScene3DMaterialTextureRegistry,
  getScene3DMaterialTextures,
  registerExtendedPbrScene3DMaterialTextures,
} from './sceneMaterialTextureRegistry';
import { registerSpecularPbrScene3DMaterialTextures } from './specularPbrScene3DMaterialTextures';

describe('registerSpecularPbrScene3DMaterialTextures', () => {
  it('lists the specular factor and color maps', () => {
    const registry = createScene3DMaterialTextureRegistry();
    registerExtendedPbrScene3DMaterialTextures(registry);
    registerSpecularPbrScene3DMaterialTextures(registry);
    const factor = createTexture();
    const color = createTexture();
    const out: Texture[] = [];
    getScene3DMaterialTextures(
      registry,
      createExtendedPbrMaterial({
        extensions: [createSpecularPbrExtension({ specularColorMap: color, specularMap: factor })],
      }),
      out,
    );
    expect(out).toEqual([factor, color]);
  });
});
