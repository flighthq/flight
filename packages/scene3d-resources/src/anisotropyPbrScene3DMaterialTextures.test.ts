import { createAnisotropyPbrExtension, createExtendedPbrMaterial } from '@flighthq/materials/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Texture } from '@flighthq/types/contract';

import { registerAnisotropyPbrScene3DMaterialTextures } from './anisotropyPbrScene3DMaterialTextures';
import {
  createScene3DMaterialTextureRegistry,
  getScene3DMaterialTextures,
  registerExtendedPbrScene3DMaterialTextures,
} from './sceneMaterialTextureRegistry';

describe('registerAnisotropyPbrScene3DMaterialTextures', () => {
  it('lists the anisotropy map through the generic Extended PBR material lister', () => {
    const registry = createScene3DMaterialTextureRegistry();
    registerExtendedPbrScene3DMaterialTextures(registry);
    registerAnisotropyPbrScene3DMaterialTextures(registry);
    const map = createTexture();
    const out: Texture[] = [];
    getScene3DMaterialTextures(
      registry,
      createExtendedPbrMaterial({ extensions: [createAnisotropyPbrExtension({ anisotropyMap: map })] }),
      out,
    );
    expect(out).toEqual([map]);
  });
});
