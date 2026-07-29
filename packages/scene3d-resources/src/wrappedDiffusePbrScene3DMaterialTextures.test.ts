import { createExtendedPbrMaterial, createWrappedDiffusePbrExtension } from '@flighthq/materials/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Texture } from '@flighthq/types/contract';

import {
  createScene3DMaterialTextureRegistry,
  getScene3DMaterialTextures,
  registerExtendedPbrScene3DMaterialTextures,
} from './sceneMaterialTextureRegistry';
import { registerWrappedDiffusePbrScene3DMaterialTextures } from './wrappedDiffusePbrScene3DMaterialTextures';

describe('registerWrappedDiffusePbrScene3DMaterialTextures', () => {
  it('lists the wrapped-diffuse color and thickness maps', () => {
    const registry = createScene3DMaterialTextureRegistry();
    registerExtendedPbrScene3DMaterialTextures(registry);
    registerWrappedDiffusePbrScene3DMaterialTextures(registry);
    const color = createTexture();
    const thickness = createTexture();
    const out: Texture[] = [];
    getScene3DMaterialTextures(
      registry,
      createExtendedPbrMaterial({
        extensions: [
          createWrappedDiffusePbrExtension({
            thicknessMap: thickness,
            wrappedDiffuseMap: color,
          }),
        ],
      }),
      out,
    );
    expect(out).toEqual([color, thickness]);
  });
});
