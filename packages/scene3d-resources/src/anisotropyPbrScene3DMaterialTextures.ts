import type { AnisotropyPbrExtension } from '@flighthq/materials/contract';
import { AnisotropyPbrExtensionKind } from '@flighthq/materials/contract';

import { registerScene3DPbrExtensionTextures } from './sceneMaterialTextureRegistry.ts';
import type { Scene3DMaterialTextureRegistry } from './types.ts';

export function registerAnisotropyPbrScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DPbrExtensionTextures(registry, AnisotropyPbrExtensionKind, (extension, out): void => {
    const anisotropy = extension as Readonly<AnisotropyPbrExtension>;
    if (anisotropy.anisotropyMap !== null) out.push(anisotropy.anisotropyMap);
  });
}
