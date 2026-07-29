import type { ClearcoatPbrExtension, Scene3DMaterialTextureRegistry } from '@flighthq/types/contract';
import { ClearcoatPbrExtensionKind } from '@flighthq/types/contract';

import { registerScene3DPbrExtensionTextures } from './sceneMaterialTextureRegistry';

export function registerClearcoatPbrScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DPbrExtensionTextures(registry, ClearcoatPbrExtensionKind, (extension, out): void => {
    const clearcoat = extension as Readonly<ClearcoatPbrExtension>;
    if (clearcoat.clearcoatMap !== null) out.push(clearcoat.clearcoatMap);
    if (clearcoat.clearcoatNormalMap !== null) out.push(clearcoat.clearcoatNormalMap);
    if (clearcoat.clearcoatRoughnessMap !== null) out.push(clearcoat.clearcoatRoughnessMap);
  });
}
