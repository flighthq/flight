import { createExtendedPbrMaterial, createTransmissionVolumePbrExtension } from '@flighthq/materials/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Texture } from '@flighthq/types/contract';

import {
  createScene3DMaterialTextureRegistry,
  getScene3DMaterialTextures,
  registerExtendedPbrScene3DMaterialTextures,
} from './sceneMaterialTextureRegistry';
import { registerTransmissionVolumePbrScene3DMaterialTextures } from './transmissionVolumePbrScene3DMaterialTextures';

describe('registerTransmissionVolumePbrScene3DMaterialTextures', () => {
  it('lists the transmission factor and thickness maps', () => {
    const registry = createScene3DMaterialTextureRegistry();
    registerExtendedPbrScene3DMaterialTextures(registry);
    registerTransmissionVolumePbrScene3DMaterialTextures(registry);
    const factor = createTexture();
    const thickness = createTexture();
    const out: Texture[] = [];
    getScene3DMaterialTextures(
      registry,
      createExtendedPbrMaterial({
        extensions: [
          createTransmissionVolumePbrExtension({
            thicknessMap: thickness,
            transmissionMap: factor,
          }),
        ],
      }),
      out,
    );
    expect(out).toEqual([factor, thickness]);
  });
});
