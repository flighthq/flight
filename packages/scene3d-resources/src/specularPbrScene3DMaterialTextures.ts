import type { Scene3DMaterialTextureRegistry, SpecularPbrExtension } from '@flighthq/types/contract';
import { SpecularPbrExtensionKind } from '@flighthq/types/contract';

import { registerScene3DPbrExtensionTextures } from './sceneMaterialTextureRegistry';

export function registerSpecularPbrScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DPbrExtensionTextures(registry, SpecularPbrExtensionKind, (extension, out): void => {
    const specular = extension as Readonly<SpecularPbrExtension>;
    if (specular.specularMap !== null) out.push(specular.specularMap);
    if (specular.specularColorMap !== null) out.push(specular.specularColorMap);
  });
}
