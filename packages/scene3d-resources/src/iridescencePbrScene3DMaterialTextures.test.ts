import { createExtendedPbrMaterial, createIridescencePbrExtension } from '@flighthq/materials/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Texture } from '@flighthq/types/contract';

import { registerIridescencePbrScene3DMaterialTextures } from './iridescencePbrScene3DMaterialTextures';
import {
  createScene3DMaterialTextureRegistry,
  getScene3DMaterialTextures,
  registerExtendedPbrScene3DMaterialTextures,
} from './sceneMaterialTextureRegistry';

describe('registerIridescencePbrScene3DMaterialTextures', () => {
  it('lists the iridescence factor and thickness maps', () => {
    const registry = createScene3DMaterialTextureRegistry();
    registerExtendedPbrScene3DMaterialTextures(registry);
    registerIridescencePbrScene3DMaterialTextures(registry);
    const factor = createTexture();
    const thickness = createTexture();
    const out: Texture[] = [];
    getScene3DMaterialTextures(
      registry,
      createExtendedPbrMaterial({
        extensions: [
          createIridescencePbrExtension({
            iridescenceMap: factor,
            iridescenceThicknessMap: thickness,
          }),
        ],
      }),
      out,
    );
    expect(out).toEqual([factor, thickness]);
  });
});
