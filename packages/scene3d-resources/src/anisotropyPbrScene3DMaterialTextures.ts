import type { AnisotropyPbrExtension, Scene3DMaterialTextureRegistry } from '@flighthq/types/contract';
import { AnisotropyPbrExtensionKind } from '@flighthq/types/contract';

import { registerScene3DPbrExtensionTextures } from './sceneMaterialTextureRegistry';

export function registerAnisotropyPbrScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DPbrExtensionTextures(registry, AnisotropyPbrExtensionKind, (extension, out): void => {
    const anisotropy = extension as Readonly<AnisotropyPbrExtension>;
    if (anisotropy.anisotropyMap !== null) out.push(anisotropy.anisotropyMap);
  });
}
