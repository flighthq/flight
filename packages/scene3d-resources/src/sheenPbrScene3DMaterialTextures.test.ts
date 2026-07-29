import { createExtendedPbrMaterial, createSheenPbrExtension } from '@flighthq/materials/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Texture } from '@flighthq/types/contract';

import {
  createScene3DMaterialTextureRegistry,
  getScene3DMaterialTextures,
  registerExtendedPbrScene3DMaterialTextures,
} from './sceneMaterialTextureRegistry';
import { registerSheenPbrScene3DMaterialTextures } from './sheenPbrScene3DMaterialTextures';

describe('registerSheenPbrScene3DMaterialTextures', () => {
  it('lists the sheen color and roughness maps', () => {
    const registry = createScene3DMaterialTextureRegistry();
    registerExtendedPbrScene3DMaterialTextures(registry);
    registerSheenPbrScene3DMaterialTextures(registry);
    const color = createTexture();
    const roughness = createTexture();
    const out: Texture[] = [];
    getScene3DMaterialTextures(
      registry,
      createExtendedPbrMaterial({
        extensions: [createSheenPbrExtension({ sheenColorMap: color, sheenRoughnessMap: roughness })],
      }),
      out,
    );
    expect(out).toEqual([color, roughness]);
  });
});
